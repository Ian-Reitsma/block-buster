const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'rpc-mock.js');
let content = fs.readFileSync(file, 'utf8');

// Patch 1: batch() capability_code syntax fix
content = content.replace(
  /message: err\.message,  \{ capability_code:/g,
  'message: err.message,  { capability_code:'
);

// Patch 2: storage.get data return
content = content.replace(
  /return \{ cid,  String\(file\.base64Data \|\| ''\), mime_type: file\.mime_type \|\| 'application\/octet-stream' \};/g,
  "return { cid,  String(file.base64Data || ''), mime_type: file.mime_type || 'application/octet-stream' };"
);

// Patch 3: Inject Governance Handlers
const handlersAnchor = 'const handlers = {';
const governanceCode = `
      // Governance (matches Governance.js component callsites)
      'governance.proposals': () => {
        const now = Date.now();
        const gd = mockDataManager.mockData.governance || (mockDataManager.mockData.governance = {
          next_id: 1,
          proposals: [],
          // Keep this schema-shaped for Governance.js fetchGovernanceData()
          parameters: {
            quorum_default_pct: 51,
            voting_period_default_days: 7,
            pass_rule: 'for_gt_against_with_quorum',
          },
          voting_power: { account: '0x0000', power: handlers['ledger.balance'](['0x0000'])?.balance || 1000 },
          total_voting_power: 100000,
          votes_by_proposal: {}, // proposal_id -> { account -> 'for'|'against' }
        });

        // Always sync voting power to the latest wallet balance dynamically
        gd.voting_power.power = handlers['ledger.balance'](['0x0000'])?.balance || 1000;

        // Finalize proposals whose voting window ended
        for (const p of gd.proposals) {
          if (p.status !== 'active') continue;
          if (now < (p.ends_at || 0)) continue;

          const turnout = (Number(p.votes_for || 0) + Number(p.votes_against || 0));
          const quorumPct = Number(p.quorum || gd.parameters.quorum_default_pct || 51);
          const quorumNeeded = (Number(gd.total_voting_power || 0) * quorumPct) / 100;

          if (turnout < quorumNeeded) {
            p.status = 'rejected';
            p.result_reason = 'quorum_not_met';
          } else {
            p.status = (Number(p.votes_for || 0) > Number(p.votes_against || 0)) ? 'passed' : 'rejected';
            p.result_reason = (p.status === 'passed') ? 'majority_for' : 'majority_against';
          }
          p.finalized_at = now;
        }

        return {
          proposals: gd.proposals,
          parameters: gd.parameters,
          voting_power: gd.voting_power,
          total_voting_power: gd.total_voting_power,
        };
      },

      'governance.create_proposal': (rawParams) => {
        const p = Array.isArray(rawParams) ? (rawParams[0] || {}) : (rawParams || {});
        const now = Date.now();

        const gd = mockDataManager.mockData.governance || (mockDataManager.mockData.governance = {
          next_id: 1,
          proposals: [],
          parameters: { quorum_default_pct: 51, voting_period_default_days: 7, pass_rule: 'for_gt_against_with_quorum' },
          voting_power: { account: '0x0000', power: handlers['ledger.balance'](['0x0000'])?.balance || 1000 },
          total_voting_power: 100000,
          votes_by_proposal: {},
        });

        const id = gd.next_id++;
        const votingPeriodDays = Math.max(1, Math.floor(Number(p.voting_period || gd.parameters.voting_period_default_days || 7)));
        const quorum = Math.max(1, Math.min(100, Math.floor(Number(p.quorum || gd.parameters.quorum_default_pct || 51))));

        const proposal = {
          id,
          title: String(p.title || \`Proposal #\${id}\`),
          type: String(p.type || 'general'),
          description: String(p.description || ''),
          proposer: '0x0000',
          created_at: now,
          ends_at: now + votingPeriodDays * 24 * 3600 * 1000,
          voting_period: votingPeriodDays,
          quorum,
          votes_for: 0,
          votes_against: 0,
          status: 'active',
        };

        gd.proposals.unshift(proposal);
        gd.votes_by_proposal[id] = gd.votes_by_proposal[id] || {};
        return { ok: true, proposal_id: id };
      },

      'governance.vote': (rawParams) => {
        const p = Array.isArray(rawParams) ? (rawParams[0] || {}) : (rawParams || {});
        const now = Date.now();

        const proposalId = Number(p.proposal_id);
        const vote = String(p.vote || '');
        if (!Number.isFinite(proposalId)) throw new Error('governance.vote: proposal_id required');
        if (!(vote === 'for' || vote === 'against')) throw new Error('governance.vote: vote must be for|against');

        const gd = mockDataManager.mockData.governance || (mockDataManager.mockData.governance = {
          next_id: 1,
          proposals: [],
          parameters: { quorum_default_pct: 51, voting_period_default_days: 7, pass_rule: 'for_gt_against_with_quorum' },
          voting_power: { account: '0x0000', power: handlers['ledger.balance'](['0x0000'])?.balance || 1000 },
          total_voting_power: 100000,
          votes_by_proposal: {},
        });

        const prop = gd.proposals.find(x => Number(x.id) === proposalId);
        if (!prop) throw new Error('governance.vote: proposal not found');
        if (prop.status !== 'active') throw new Error(\`governance.vote: proposal not active (\${prop.status})\`);
        if (now >= (prop.ends_at || 0)) throw new Error('governance.vote: voting period ended');

        const account = '0x0000';
        
        // Dynamically get current voting power from ledger balance
        const power = handlers['ledger.balance']([account])?.balance || 1000;

        gd.votes_by_proposal[proposalId] = gd.votes_by_proposal[proposalId] || {};
        const prev = gd.votes_by_proposal[proposalId][account];

        // Remove previous vote (allows changing vote in mock mode)
        if (prev === 'for') prop.votes_for = Math.max(0, Number(prop.votes_for || 0) - power);
        if (prev === 'against') prop.votes_against = Math.max(0, Number(prop.votes_against || 0) - power);

        // Apply new vote
        gd.votes_by_proposal[proposalId][account] = vote;
        if (vote === 'for') prop.votes_for = Number(prop.votes_for || 0) + power;
        else prop.votes_against = Number(prop.votes_against || 0) + power;

        prop.last_vote_at = now;

        // Real-time status update (early finalize if >50% of total voting power)
        const total = Number(gd.total_voting_power || 0);
        if (prop.votes_for > total * 0.5) {
          prop.status = 'passed';
          prop.finalized_at = now;
          prop.result_reason = 'early_majority_for';
        } else if (prop.votes_against > total * 0.5) {
          prop.status = 'rejected';
          prop.finalized_at = now;
          prop.result_reason = 'early_majority_against';
        }

        return { ok: true, proposal_id: proposalId, status: prop.status, votes_for: prop.votes_for, votes_against: prop.votes_against };
      },
`;

if (!content.includes('governance.proposals')) {
  content = content.replace(handlersAnchor, handlersAnchor + '\\n' + governanceCode);
}

fs.writeFileSync(file, content, 'utf8');
console.log('Patch applied successfully');
