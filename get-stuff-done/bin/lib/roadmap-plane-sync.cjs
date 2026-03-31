const path = require('path');
const { safeFs, logWarn, logInfo, findPhaseInternal } = require('./core.cjs');
const planeClient = require('./plane-client.cjs');
const { parseRoadmap } = require('./roadmap.cjs');

// Status mapping from GSD/ROADMAP status to Plane state
const STATUS_MAP = {
  'Planned': 'Todo',
  'Research': 'Backlog',
  'Discussed': 'Todo',
  'In Progress': 'In Progress',
  'Blocked': 'Blocked',
  'Complete': 'Done',
  'Verified': 'Done'
};

function mapGSDStatusToPlane(gsdStatus) {
  return STATUS_MAP[gsdStatus] || 'Todo';
}

/**
 * Search Plane for issues with a given custom field value.
 * Returns the first matching issue or null.
 * Uses cached registry for this sync run plus a GET query to Plane.
 * For idempotency, custom fields serve as stable identifiers.
 *
 * @param {string} customFieldKey - The custom field key to search for
 * @param {string} customFieldValue - The custom field value to match
 * @param {Object} opts - Options (dryRun to skip network calls)
 */
async function findIssueByCustomField(customFieldKey, customFieldValue, opts = {}) {
  // Initialize registry for caching within this sync run
  if (!findIssueByCustomField.registry) {
    findIssueByCustomField.registry = new Map();
  }
  const key = `${customFieldKey}:${customFieldValue}`;
  // Return cached if available
  if (findIssueByCustomField.registry.has(key)) {
    return findIssueByCustomField.registry.get(key);
  }

  // If Plane not configured, return null
  if (!planeClient.apiKey || !planeClient.projectId) {
    return null;
  }

  // In dry-run mode, skip network calls and return null (treat as non-existent)
  if (opts.dryRun) {
    return null;
  }

  try {
    // Build query endpoint: GET /v1/projects/{id}/issues?filter[<key>]=<value>
    const endpoint = `projects/${planeClient.projectId}/issues?filter[${customFieldKey}]=${encodeURIComponent(customFieldValue)}`;
    // Use planeClient._request with GET method
    const response = await planeClient._request('find-issue', endpoint, null, 'GET');
    // Expect response as array; adapt to Plane's actual response shape
    const issues = Array.isArray(response) ? response : (response?.issues || response?.data || []);
    const found = issues.length > 0 ? issues[0] : null;
    if (found) {
      findIssueByCustomField.registry.set(key, found);
    }
    return found;
  } catch (err) {
    logWarn('findIssueByCustomField query failed', { key, value: customFieldValue, error: err.message });
    return null;
  }
}

function registerIssue(customFieldKey, customFieldValue, issue) {
  if (!findIssueByCustomField.registry) {
    findIssueByCustomField.registry = new Map();
  }
  const key = `${customFieldKey}:${customFieldValue}`;
  findIssueByCustomField.registry.set(key, issue);
}

/**
 * Sync full roadmap to Plane with idempotent upsert and drift detection.
 * @param {string} cwd - Project root
 * @param {Object} options - { dryRun, force }
 */
async function syncFullRoadmap(cwd, options = {}) {
  const results = {
    milestones: { created: 0, updated: 0, unchanged: 0, errors: 0 },
    phases: { created: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0 },
    plans: { created: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0 },
    drift_detected: 0,
    errors: [],
    dry_run: options.dryRun || false,
    force: options.force || false
  };
  const start = Date.now();

  // Return early if Plane not configured
  if (!planeClient.apiKey || !planeClient.projectId) {
    return { synced: false, reason: 'Plane not configured' };
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!safeFs.existsSync(roadmapPath)) {
    results.errors.push({ type: 'setup', message: 'ROADMAP.md not found' });
    return { synced: false, errors: results.errors };
  }

  // Get roadmap data (use parseRoadmap to avoid process.exit)
  const roadmapData = parseRoadmap(cwd);
  const { milestones, phases: phaseDataList } = roadmapData;

  // Reset registry for this run
  findIssueByCustomField.registry = new Map();

  // --- Sync Milestones ---
  for (const milestone of milestones) {
    try {
      const version = milestone.version;
      const name = milestone.heading.trim();

      // Check for existing milestone via custom field
      const existing = await findIssueByCustomField('gsd_milestone_version', version, { dryRun: options.dryRun });

      const payload = {
        name,
        gsd_milestone_version: version,
        gsd_last_synced_at: new Date().toISOString()
      };

      if (existing) {
        // Drift detection: compare protected fields
        const protectedFields = ['name', 'gsd_milestone_version'];
        const drift = {};
        for (const field of protectedFields) {
          if (existing[field] !== payload[field]) {
            drift[field] = { existing: existing[field], desired: payload[field] };
          }
        }

        if (Object.keys(drift).length > 0) {
          results.drift_detected++;
          logWarn('Milestone drift detected', { version, drift });

          if (options.force) {
            // Update if force is true
            if (!results.dry_run) {
              await planeClient.updateIssue(existing.id, payload);
              results.milestones.updated++;
            } else {
              results.milestones.updated++;
            }
          } else {
            // Skip update, keep existing
            results.milestones.unchanged++;
          }
        } else {
          results.milestones.unchanged++;
        }

        // Register to avoid duplicate creation attempts
        registerIssue('gsd_milestone_version', version, { ...existing, ...payload });
      } else {
        // Create new milestone
        if (!results.dry_run) {
          const created = await planeClient.createMilestone(payload);
          registerIssue('gsd_milestone_version', version, created);
          results.milestones.created++;
        } else {
          results.milestones.created++;
        }
      }
    } catch (err) {
      results.milestones.errors++;
      results.errors.push({ type: 'milestone', version: milestone.version, error: err.message });
      logWarn('Milestone sync failed', { version: milestone.version, error: err.message });
    }
  }

  // --- Sync Phases and Plans ---
  for (const phase of phaseDataList) {
    try {
      // Determine GSD status for this phase
      let gsdStatus;
      if (phase.roadmap_complete) {
        gsdStatus = 'Complete';
      } else if (phase.disk_status === 'complete') {
        gsdStatus = 'Complete';
      } else if (phase.disk_status === 'partial') {
        gsdStatus = 'In Progress';
      } else if (phase.disk_status === 'planned') {
        gsdStatus = 'Planned';
      } else if (phase.disk_status === 'researched' || phase.disk_status === 'discussed') {
        gsdStatus = 'Research';
      } else {
        gsdStatus = 'Planned';
      }

      const planeState = mapGSDStatusToPlane(gsdStatus);

      // Get detailed phase info from filesystem
      const phaseInfo = findPhaseInternal(cwd, phase.number);
      if (!phaseInfo) {
        results.phases.skipped++;
        continue;
      }

      // Build phase issue payload with enrichment
      const phaseLabels = ['Synced from GSD'];
      if (gsdStatus === 'Discussed' || phase.disk_status === 'discussed') {
        phaseLabels.push('discussed');
      }

      const phaseIssuePayload = {
        name: `Phase ${phase.number}: ${phase.name}`,
        description: `**Goal:** ${phase.goal || 'N/A'}\n\n**Child Plans:** ${phaseInfo.plans.length} plans`,
        state: planeState,
        labels: phaseLabels,
        gsd_phase_number: phase.number,
        gsd_sync_version: '1.0',
        gsd_last_synced_at: new Date().toISOString()
      };

      // Check for existing phase issue
      const existingPhase = await findIssueByCustomField('gsd_phase_number', phase.number, { dryRun: options.dryRun });
      let phaseIssue = null; // will be set if we create new

      if (existingPhase) {
        // Drift detection for phase
        const protectedFields = ['name', 'state', 'gsd_phase_number'];
        const drift = {};
        for (const field of protectedFields) {
          if (existingPhase[field] !== phaseIssuePayload[field]) {
            drift[field] = { existing: existingPhase[field], desired: phaseIssuePayload[field] };
          }
        }

        if (Object.keys(drift).length > 0) {
          results.drift_detected++;
          logWarn('Phase drift detected', { phase: phase.number, drift });

          if (options.force) {
            if (!results.dry_run) {
              await planeClient.updateIssue(existingPhase.id, phaseIssuePayload);
              results.phases.updated++;
            } else {
              results.phases.updated++;
            }
          } else {
            results.phases.unchanged++;
          }
        } else {
          results.phases.unchanged++;
        }

        registerIssue('gsd_phase_number', phase.number, { ...existingPhase, ...phaseIssuePayload });
      } else {
        // Create new phase issue
        if (!results.dry_run) {
          phaseIssue = await planeClient.createIssue(phaseIssuePayload);
          registerIssue('gsd_phase_number', phase.number, phaseIssue);
          results.phases.created++;
        } else {
          results.phases.created++;
        }
      }

      // --- Sync Plan child issues ---
      for (const planFile of phaseInfo.plans) {
        try {
          const planId = planFile.replace('-PLAN.md', '').replace('PLAN.md', '');
          const planPath = path.join(phaseInfo.directory, planFile);
          const planContent = safeFs.readFileSync(planPath, 'utf-8');

          // Extract objective from <objective> block (simple regex extraction)
          const objectiveMatch = planContent.match(/<objective>([\s\S]*?)<\/objective>/i);
          const description = objectiveMatch
            ? objectiveMatch[1].trim().substring(0, 500) + '\n\n*Synced from GSD*'
            : `From Phase ${phase.number}`;

          const planLabels = ['Synced from GSD'];
          // If phase status is Discussed-derived, propagate label
          if (gsdStatus === 'Research' && phase.disk_status === 'discussed') {
            planLabels.push('discussed');
          }

          const planIssuePayload = {
            name: `Plan ${planId}`,
            description,
            state: 'Todo',
            labels: planLabels,
            gsd_plan_id: planId,
            gsd_phase_number: phase.number,
            gsd_sync_version: '1.0',
            gsd_last_synced_at: new Date().toISOString()
          };

          // Determine parent ID: use the phase issue we just created/found
          const parentIssue = existingPhase || (phaseIssue ? phaseIssue : null);
          if (parentIssue) {
            planIssuePayload.parent_id = parentIssue.id || parentIssue.data?.id;
          }

          // Check for existing plan issue
          const existingPlan = await findIssueByCustomField('gsd_plan_id', planId, { dryRun: options.dryRun });

          if (existingPlan) {
            // Drift detection for plan (description is not protected; only state and title matter)
            const protectedFields = ['name', 'state', 'gsd_plan_id', 'gsd_phase_number'];
            const drift = {};
            for (const field of protectedFields) {
              if (existingPlan[field] !== planIssuePayload[field]) {
                drift[field] = { existing: existingPlan[field], desired: planIssuePayload[field] };
              }
            }

            if (Object.keys(drift).length > 0) {
              results.drift_detected++;
              logWarn('Plan drift detected', { plan: planId, drift });

              if (options.force) {
                if (!results.dry_run) {
                  await planeClient.updateIssue(existingPlan.id, planIssuePayload);
                  results.plans.updated++;
                } else {
                  results.plans.updated++;
                }
              } else {
                results.plans.unchanged++;
              }
            } else {
              results.plans.unchanged++;
            }

            registerIssue('gsd_plan_id', planId, { ...existingPlan, ...planIssuePayload });
          } else {
            // Create new plan issue
            if (!results.dry_run) {
              await planeClient.createIssue(planIssuePayload);
              results.plans.created++;
            } else {
              results.plans.created++;
            }
          }

          // Link parent if needed (Plane may auto-link via parent_id; this is fallback)
          if (parentIssue && planIssuePayload.parent_id && !existingPlan && !results.dry_run) {
            try {
              const createdPlan = await planeClient.createIssue(planIssuePayload);
              await planeClient.linkIssueParent(createdPlan.id || createdPlan.data?.id, parentIssue.id || parentIssue.data?.id);
            } catch (linkErr) {
              logWarn('Parent linking failed', { plan: planId, error: linkErr.message });
            }
          }
        } catch (planErr) {
          results.plans.errors++;
          results.errors.push({ type: 'plan', plan: planFile, error: planErr.message });
          logWarn('Plan sync failed', { plan: planFile, error: planErr.message });
        }
      }
    } catch (err) {
      results.phases.errors++;
      results.errors.push({ type: 'phase', phase: phase.number, error: err.message });
      logWarn('Phase sync failed', { phase: phase.number, error: err.message });
    }
  }

  results.synced = true;
  results.duration_ms = Date.now() - start;
  return results;
}

/**
 * Fire-and-forget ROADMAP change notification.
 */
async function notifyRoadmapChange(cwd, roadmapPath) {
  if (!planeClient.apiKey || !planeClient.projectId) return;
  try {
    await syncFullRoadmap(cwd);
    logInfo('Roadmap sync completed');
  } catch (err) {
    logWarn('Roadmap sync failed (continuing):', { error: err.message });
  }
}

module.exports = { syncFullRoadmap, notifyRoadmapChange, findIssueByCustomField, mapGSDStatusToPlane };
