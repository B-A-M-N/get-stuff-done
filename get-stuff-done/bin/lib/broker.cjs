const amqp = require('amqplib');

/**
 * RabbitMQ Broker for GSD Pulse events.
 */
class GsdBroker {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.exchange = 'gsd.pulse';
    this.isConnected = false;
    this.amqpUrl = process.env.AMQP_URL || 'amqp://localhost';
    this.maxRetries = 5;
    this.retryDelay = 1000; // Starting delay in ms
  }

  /**
   * Connect to RabbitMQ with exponential backoff.
   */
  async connect(retryCount = 0) {
    try {
      console.log(`Connecting to RabbitMQ at ${this.amqpUrl}...`);
      this.connection = await amqp.connect(this.amqpUrl);
      this.channel = await this.connection.createChannel();
      
      // Ensure exchange exists
      await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
      
      this.isConnected = true;
      console.log('RabbitMQ connected successfully.');

      this.connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err.message);
        this.isConnected = false;
      });

      this.connection.on('close', () => {
        console.warn('RabbitMQ connection closed.');
        this.isConnected = false;
      });

    } catch (err) {
      console.error(`RabbitMQ connection failed: ${err.message}`);
      if (retryCount < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        console.log(`Retrying in ${delay}ms... (Attempt ${retryCount + 1}/${this.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.connect(retryCount + 1);
      } else {
        console.error('Max RabbitMQ connection retries reached. Operating in disconnected mode.');
        this.isConnected = false;
      }
    }
  }

  /**
   * Publish a message to the gsd.pulse exchange.
   */
  async publish(topic, message) {
    if (!this.isConnected || !this.channel) {
      console.warn(`Cannot publish to ${topic}: Broker not connected.`);
      return null;
    }

    try {
      const payload = Buffer.from(JSON.stringify(message));
      const result = this.channel.publish(this.exchange, topic, payload, { persistent: true });
      return result;
    } catch (err) {
      console.error(`Failed to publish message to ${topic}: ${err.message}`);
      return null;
    }
  }

  /**
   * Subscribe to messages with a specific topic pattern.
   */
  async subscribe(topicPattern, callback) {
    if (!this.isConnected || !this.channel) {
      console.error(`Cannot subscribe to ${topicPattern}: Broker not connected.`);
      return null;
    }

    try {
      const q = await this.channel.assertQueue('', { exclusive: true });
      await this.channel.bindQueue(q.queue, this.exchange, topicPattern);
      
      await this.channel.consume(q.queue, (msg) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString());
            callback(content, msg.fields.routingKey);
            this.channel.ack(msg);
          } catch (err) {
            console.error('Error processing RabbitMQ message:', err.message);
            // Still ack to prevent loop if it's a parsing error
            this.channel.ack(msg);
          }
        }
      });
      
      console.log(`Subscribed to topic: ${topicPattern}`);
      return q.queue;
    } catch (err) {
      console.error(`Failed to subscribe to ${topicPattern}: ${err.message}`);
      return null;
    }
  }

  /**
   * Close connection gracefully.
   */
  async close() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
    } catch (err) {
      console.error('Error closing RabbitMQ connection:', err.message);
    } finally {
      this.isConnected = false;
    }
  }
}

module.exports = new GsdBroker();
