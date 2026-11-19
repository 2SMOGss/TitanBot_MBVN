import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePrefixCommand, parseArguments } from '../src/utils/prefixParser.js';
import { createMockInteraction } from '../src/utils/messageAdapter.js';
import {
  checkRateLimit,
  clearAllRateLimits,
  pruneRateLimitStore,
  getRateLimitStoreSize,
} from '../src/utils/rateLimiter.js';
import {
  enforceAbuseProtection,
  resetAbuseProtectionState,
  pruneBlockedAttemptStore,
  getBlockedAttemptStoreSize,
} from '../src/utils/abuseProtection.js';
import { pruneClientCooldowns } from '../src/events/interactionCreate.js';
import {
  calculationContexts,
  calculationHistory,
  pruneCalculationState,
} from '../src/commands/Tools/calculate.js';
import { validateShortenUrl } from '../src/commands/Tools/shorten.js';
import sayCommand from '../src/commands/Moderation/say.js';
import {
  sanitizeCommandPayloadDescriptions,
  validateCommands,
} from '../src/handlers/loaders/commandLoader.js';
import { wipeStructuredPostgresTables } from '../src/handlers/wipedataButtons.js';
import { resolveSslConfig, resolvePostgresPoolConfig } from '../src/config/database/postgres.js';

test('prefixParser preserves contractions (what\'s, don\'t, can\'t, it\'s) as single words while parsing quoted phrases', () => {
  const parsedContractions = parsePrefixCommand("!ask what's UPX and why can't I don't mint it's FSA?", '!');
  assert.ok(parsedContractions);
  assert.equal(parsedContractions.commandName, 'ask');
  assert.deepEqual(parsedContractions.args, [
    "what's",
    'UPX',
    'and',
    'why',
    "can't",
    'I',
    "don't",
    'mint',
    "it's",
    'FSA?',
  ]);

  const parsedQuotes = parseArguments('say "hello world" \'multi word arg\' what\'s_next');
  assert.deepEqual(parsedQuotes, [
    'say',
    'hello world',
    'multi word arg',
    "what's_next",
  ]);
});

test('messageAdapter options.getChannel() and options.getRole() return synchronously resolved objects instead of Promises', () => {
  const mockChannel = { id: '123456789012345678', name: 'general', type: 0 };
  const mockRole = { id: '987654321098765432', name: 'Veteran' };

  const channelMap = new Map([[mockChannel.id, mockChannel]]);
  channelMap.find = (predicate) => {
    for (const val of channelMap.values()) {
      if (predicate(val)) return val;
    }
    return undefined;
  };

  const roleMap = new Map([[mockRole.id, mockRole]]);
  roleMap.find = (predicate) => {
    for (const val of roleMap.values()) {
      if (predicate(val)) return val;
    }
    return undefined;
  };

  const message = {
    id: 'msg_1',
    author: { id: 'user_1', tag: 'User#0001' },
    member: { id: 'user_1', permissions: null },
    channel: mockChannel,
    mentions: {
      channels: new Map(),
      roles: new Map(),
    },
    guild: {
      id: 'guild_1',
      members: { cache: new Map() },
      channels: { cache: channelMap },
      roles: { cache: roleMap },
    },
    client: {},
  };

  const commandData = {
    name: 'testcmd',
    options: [
      { name: 'target_channel', type: 7, required: true },
      { name: 'target_role', type: 8, required: true },
    ],
  };

  const interaction = createMockInteraction(message, commandData, [
    `<#${mockChannel.id}>`,
    `<@&${mockRole.id}>`,
  ]);

  const resolvedChannel = interaction.options.getChannel('target_channel');
  const resolvedRole = interaction.options.getRole('target_role');

  assert.equal(resolvedChannel instanceof Promise, false);
  assert.equal(resolvedRole instanceof Promise, false);
  assert.deepEqual(resolvedChannel, mockChannel);
  assert.deepEqual(resolvedRole, mockRole);

  // Also test resolving by name synchronously
  const interactionByName = createMockInteraction(message, commandData, ['general', 'veteran']);
  assert.deepEqual(interactionByName.options.getChannel('target_channel'), mockChannel);
  assert.deepEqual(interactionByName.options.getRole('target_role'), mockRole);
});

test('Bounded Maps in rateLimiter, abuseProtection, interactionCreate cooldowns, and calculate prune expired and excess entries', async () => {
  // 1. rateLimiter
  clearAllRateLimits();
  for (let i = 0; i < 20; i++) {
    await checkRateLimit(`key_${i}`, 2, 1000);
  }
  assert.equal(getRateLimitStoreSize(), 20);
  pruneRateLimitStore(Date.now(), 5);
  assert.equal(getRateLimitStoreSize(), 5);

  // Verify rate limit enforcement still blocks after maxAttempts
  clearAllRateLimits();
  assert.equal(await checkRateLimit('user:test', 2, 60_000), true);
  assert.equal(await checkRateLimit('user:test', 2, 60_000), true);
  assert.equal(await checkRateLimit('user:test', 2, 60_000), false);

  // 2. abuseProtection
  resetAbuseProtectionState();
  const riskyCmd = { category: 'moderation', abuseProtection: { maxAttempts: 1, windowMs: 60_000 } };
  for (let i = 0; i < 10; i++) {
    const mockInt = { guildId: 'g1', user: { id: `u_${i}` } };
    await enforceAbuseProtection(mockInt, riskyCmd, 'ban'); // allowed 1st time
    await enforceAbuseProtection(mockInt, riskyCmd, 'ban'); // blocked 2nd time -> records blocked attempt
  }
  assert.equal(getBlockedAttemptStoreSize(), 10);
  pruneBlockedAttemptStore(Date.now(), 3);
  assert.equal(getBlockedAttemptStoreSize(), 3);

  // 3. interactionCreate client.cooldowns
  const cooldowns = new Map();
  const now = Date.now();
  cooldowns.set('expired_1', now - 1000);
  cooldowns.set('active_1', now + 60_000);
  cooldowns.set('active_2', now + 60_000);
  cooldowns.set('active_3', now + 60_000);
  pruneClientCooldowns(cooldowns, now, 2);
  assert.equal(cooldowns.has('expired_1'), false);
  assert.equal(cooldowns.size, 2);

  // 4. calculate.js calculationContexts & calculationHistory
  calculationContexts.clear();
  calculationHistory.clear();
  calculationContexts.set('expired_ctx', { createdAt: now - 35 * 60 * 1000 });
  calculationContexts.set('fresh_ctx_1', { createdAt: now });
  calculationContexts.set('fresh_ctx_2', { createdAt: now });
  calculationHistory.set('expired_user', [{ timestamp: now - 35 * 60 * 1000 }]);
  calculationHistory.set('fresh_user_1', [{ timestamp: now }]);
  calculationHistory.set('fresh_user_2', [{ timestamp: now }]);

  pruneCalculationState(now, 1);
  assert.equal(calculationContexts.has('expired_ctx'), false);
  assert.equal(calculationContexts.size, 1);
  assert.equal(calculationHistory.has('expired_user'), false);
  assert.equal(calculationHistory.size, 1);
});

test('/shorten validateShortenUrl strictly allows http: and https: and rejects javascript:, data:, file:, and invalid URLs', () => {
  assert.equal(validateShortenUrl('https://www.upland.me/').valid, true);
  assert.equal(validateShortenUrl('http://example.com/test?x=1').valid, true);
  assert.equal(validateShortenUrl('javascript:alert(1)').valid, false);
  assert.equal(validateShortenUrl('data:text/html,<script>alert(1)</script>').valid, false);
  assert.equal(validateShortenUrl('file:///etc/passwd').valid, false);
  assert.equal(validateShortenUrl('ftp://files.example.com').valid, false);
  assert.equal(validateShortenUrl('not a url').valid, false);
});

test('/say enforces allowedMentions: { parse: ["users"] } when sending message to channel', async () => {
  let sentPayload = null;
  const mockChannel = {
    id: 'chan_1',
    type: 0, // GuildText
    permissionsFor: () => ({ has: () => true }),
    send: async (payload) => {
      sentPayload = payload;
      return { id: 'sent_1', url: 'https://discord.com/channels/1/2/3' };
    },
    toString: () => '<#chan_1>',
  };

  const mockInteraction = {
    id: 'int_1',
    user: { id: 'mod_1', tag: 'Mod#0001' },
    member: { id: 'mod_1' },
    guildId: 'guild_1',
    guild: {
      id: 'guild_1',
      members: { me: { id: 'bot_1' } },
      channels: { cache: new Map() },
    },
    channel: mockChannel,
    deferred: true,
    replied: false,
    options: {
      getString: (name) => (name === 'message' ? 'Hello @everyone and <@123456>!' : null),
      getChannel: () => mockChannel,
    },
    deferReply: async () => {},
    editReply: async () => ({}),
  };

  await sayCommand.execute(mockInteraction, {}, { db: null });
  assert.ok(sentPayload);
  assert.deepEqual(sentPayload.allowedMentions, { parse: ['users'] });
});

test('commandLoader truncates descriptions > 100 chars and validates within Discord 100-char limit', () => {
  const overlongCmd = {
    name: 'testlong',
    description: 'A'.repeat(135),
    options: [
      {
        name: 'opt1',
        description: 'B'.repeat(120),
        type: 3,
      },
    ],
  };

  sanitizeCommandPayloadDescriptions(overlongCmd);
  assert.equal(overlongCmd.description.length, 100);
  assert.equal(overlongCmd.options[0].description.length, 100);
  assert.doesNotThrow(() => validateCommands([overlongCmd]));
});

test('wipedata wipeStructuredPostgresTables executes parameterized DELETE queries across structured tables', async () => {
  const executedQueries = [];
  const mockClient = {
    db: {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        return { rowCount: 1 };
      },
    },
  };

  const userRows = await wipeStructuredPostgresTables(mockClient, 'guild_123', 'user_456');
  assert.ok(userRows > 0);
  assert.ok(executedQueries.some((q) => q.sql.includes('DELETE FROM user_levels WHERE guild_id = $1 AND user_id = $2')));
  assert.ok(executedQueries.some((q) => q.sql.includes('DELETE FROM upland_faq_entries WHERE guild_id = $1 AND author_id = $2')));
  assert.ok(executedQueries.every((q) => q.params[0] === 'guild_123' && q.params[1] === 'user_456'));

  executedQueries.length = 0;
  const guildRows = await wipeStructuredPostgresTables(mockClient, 'guild_123', null, { guildWide: true });
  assert.ok(guildRows > 0);
  assert.ok(executedQueries.some((q) => q.sql === 'DELETE FROM upland_faq_entries WHERE guild_id = $1'));
  assert.ok(executedQueries.some((q) => q.sql === 'DELETE FROM join_to_create_configs WHERE guild_id = $1'));
  assert.ok(executedQueries.some((q) => q.sql === 'DELETE FROM custom_Variables WHERE guild_id = $1'));
});

test('postgres.js resolveSslConfig supports POSTGRES_SSL_REJECT_UNAUTHORIZED defaulting to false and enforcing true when set', () => {
  // Unset in development -> false
  assert.equal(resolveSslConfig({ NODE_ENV: 'development' }), false);

  // Production with unset POSTGRES_SSL_REJECT_UNAUTHORIZED -> { rejectUnauthorized: false }
  assert.deepEqual(
    resolveSslConfig({ NODE_ENV: 'production' }),
    { rejectUnauthorized: false }
  );

  // Production with POSTGRES_SSL_REJECT_UNAUTHORIZED='true' -> { rejectUnauthorized: true }
  assert.deepEqual(
    resolveSslConfig({ NODE_ENV: 'production', POSTGRES_SSL_REJECT_UNAUTHORIZED: 'true' }),
    { rejectUnauthorized: true }
  );

  // POSTGRES_SSL='true' and POSTGRES_SSL_REJECT_UNAUTHORIZED='1' -> { rejectUnauthorized: true }
  assert.deepEqual(
    resolveSslConfig({ POSTGRES_SSL: 'true', POSTGRES_SSL_REJECT_UNAUTHORIZED: '1' }),
    { rejectUnauthorized: true }
  );

  // Explicit POSTGRES_SSL='false' overrides everything to false
  assert.equal(
    resolveSslConfig({ NODE_ENV: 'production', POSTGRES_SSL: 'false', POSTGRES_SSL_REJECT_UNAUTHORIZED: 'true' }),
    false
  );

  const poolCfg = resolvePostgresPoolConfig({
    NODE_ENV: 'production',
    POSTGRES_URL: 'postgresql://user:pass@db.example.com:5432/titanbot',
    POSTGRES_SSL_REJECT_UNAUTHORIZED: 'true',
  });
  assert.deepEqual(poolCfg.ssl, { rejectUnauthorized: true });
});
