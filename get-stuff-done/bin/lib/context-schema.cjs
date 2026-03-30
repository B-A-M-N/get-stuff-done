/**
 * Context Schema — unified context specification for Firecrawl integration.
 * Defines the schema for crawl specifications used by FirecrawlClient.
 */

const { z } = require('zod');

// ---------------------------------------------------------------------------
// crawlSpecSchema — validates unified context specification (FIRECRAWL-CONTROL-02)
// ---------------------------------------------------------------------------

const crawlSpecSchema = z.object({
  sources: z.array(z.string().min(1)).min(1),
  options: z.object({
    extract_schema: z.any().optional(),
    filter_globs: z.array(z.string()).optional(),
    max_total_bytes: z.number().int().positive().optional(),
    timeout_ms: z.number().int().positive().optional(),
    normalize: z.boolean().optional(),
    allowed_roots: z.array(z.string()).optional(),
  }).optional(),
});

module.exports = {
  crawlSpecSchema,
};
