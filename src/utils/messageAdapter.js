// messageAdapter.js

import { mapArgumentsToOptions } from './prefixParser.js';
import { createEmbed } from './embeds.js';
import { handleInteractionError } from './errorHandler.js';
import { logger } from './logger.js';
import { InteractionHelper } from './interactionHelper.js';
import { SLASH_ONLY_COMMANDS } from '../config/commands/prefixRestrictions.js';
import { getCommandPrefix } from '../config/bot.js';
import { ResponseCoordinator, buildPrefixUsage } from './responseCoordinator.js';
import { enforceDefaultCommandPermissions } from './permissionGuard.js';

export { buildPrefixUsage };

function getCommandJson(commandData) {
  return commandData?.toJSON ? commandData.toJSON() : commandData;
}

export function resolveSlashAccessKey(interaction) {
  const subcommandGroup = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand(false);

  if (subcommandGroup && subcommand) {
    return `${interaction.commandName} ${subcommandGroup} ${subcommand}`;
  }

  if (subcommand) {
    return `${interaction.commandName} ${subcommand}`;
  }

  return interaction.commandName;
}

export function resolvePrefixAccessKey(commandData, args) {
  const options = mapArgumentsToOptions(args, commandData);
  const subcommand = options.getSubcommand();
  const subcommandGroup = options.getSubcommandGroup();
  const commandName = getCommandJson(commandData)?.name;

  if (!commandName) {
    return null;
  }

  if (subcommandGroup && subcommand) {
    return `${commandName} ${subcommandGroup} ${subcommand}`;
  }

  if (subcommand) {
    return `${commandName} ${subcommand}`;
  }

  return commandName;
}

export function createMockInteraction(message, commandData, args) {
  const options = mapArgumentsToOptions(args, commandData);
  const commandStartTime = Date.now();

  const mockInteraction = {
    user: message.author,
    member: message.member,
    get memberPermissions() {
      return message.member?.permissions ?? null;
    },

    channel: message.channel,
    guild: message.guild,
    guildId: message.guild?.id,

    commandName: commandData?.name || null,
    commandId: message.id,
    id: message.id,

    options: {
      get: (name) => options.get(name),
      getString: (name) => options.getString(name),
      getUser: (name) => {
        const userId = options.getUser(name);
        if (!userId || !message.guild) return null;

        const mentionMatch = userId.match(/<@!?(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : userId;

        const cachedMember = message.guild.members.cache.get(id);
        if (cachedMember) {
          return cachedMember.user;
        }

        return {
          id,
          username: 'Unknown',
          bot: false,
          tag: 'Unknown#0000',
        };
      },
      getMember: (name) => {
        const userId = options.getUser(name);
        if (!userId || !message.guild) return null;

        const mentionMatch = userId.match(/<@!?(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : userId;

        return message.guild.members.cache.get(id) ?? null;
      },
      getChannel: (name) => {
        const channelInput = options.getString(name);
        if (!channelInput || !message.guild) return null;

        const trimmed = String(channelInput).trim();
        const mentionMatch = trimmed.match(/^<#(\d+)>$/) || trimmed.match(/<#(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : trimmed;

        const mentionedChannel = message.mentions?.channels?.get?.(id);
        if (mentionedChannel) {
          return mentionedChannel;
        }

        const channelCache = message.guild.channels?.cache;
        if (!channelCache) return null;

        const byId = channelCache.get?.(id);
        if (byId) {
          return byId;
        }

        const normalizedName = trimmed.replace(/^#/, '').toLowerCase();
        return channelCache.find?.((ch) => ch?.name?.toLowerCase() === normalizedName) ?? null;
      },
      getRole: (name) => {
        const roleInput = options.getString(name);
        if (!roleInput || !message.guild) return null;

        const trimmed = String(roleInput).trim();
        const mentionMatch = trimmed.match(/^<@&(\d+)>$/) || trimmed.match(/<@&(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : trimmed;

        const mentionedRole = message.mentions?.roles?.get?.(id);
        if (mentionedRole) {
          return mentionedRole;
        }

        const roleCache = message.guild.roles?.cache;
        if (!roleCache) return null;

        const byId = roleCache.get?.(id);
        if (byId) {
          return byId;
        }

        const normalizedName = trimmed.replace(/^@/, '').toLowerCase();
        return roleCache.find?.((role) => role?.name?.toLowerCase() === normalizedName) ?? null;
      },
      getInteger: (name) => options.getInteger(name),
      getBoolean: (name) => options.getBoolean(name),
      getSubcommand: () => options.getSubcommand(),
      getSubcommandGroup: () => options.getSubcommandGroup(),
      validateRequired: () => options.validateRequired(),
      _hoistedOptions: args.map((arg, index) => ({
        name: commandData?.options?.[index]?.name || `arg${index}`,
        value: arg,
        type: 3,
      })),
    },

    createdTimestamp: message.createdTimestamp,
    createdAt: message.createdAt,
    _commandStartTime: commandStartTime,
    _isPrefixCommand: true,

    client: message.client,

    deferred: false,
    replied: false,
    _replyMessage: null,

    deleteReply: async () => {
      const replyMessage = coordinator.getReplyMessage();
      if (replyMessage?.deletable) {
        return replyMessage.delete();
      }
      if (message.deletable) {
        return message.delete();
      }
    },

    fetchReply: async () => coordinator.getReplyMessage() || message,

    ephemeral: false,
    webhook: null,
  };

  const coordinator = ResponseCoordinator.attach(mockInteraction, { message });

  mockInteraction.reply = (payload) => coordinator.respond(payload);
  mockInteraction.editReply = (payload) => coordinator.edit(payload);
  mockInteraction.followUp = (payload) => coordinator.followUp(payload);
  mockInteraction.deferReply = () => coordinator.deferLocal();

  InteractionHelper.patchInteractionResponses(mockInteraction);

  return mockInteraction;
}

export function supportsPrefixExecution(command) {
  if (command.prefixOnly === false || command.slashOnly === true) {
    return false;
  }

  const commandName = command.data?.name?.toLowerCase();
  if (commandName && SLASH_ONLY_COMMANDS.has(commandName)) {
    return false;
  }

  if (command.prefixExecute) {
    return true;
  }

  return !!command.execute;
}

export async function executePrefixCommand(command, message, args, client, prefixOverride = null, guildConfig = null) {
  const mockInteraction = createMockInteraction(message, command.data, args);
  const coordinator = mockInteraction._responseCoordinator;
  const prefix = prefixOverride || getCommandPrefix();

  try {
    const permissionAllowed = await enforceDefaultCommandPermissions(mockInteraction, command, {
      source: 'messageAdapter.executePrefixCommand',
      guildConfig,
    });
    if (!permissionAllowed) {
      return;
    }

    const validation = mockInteraction.options.validateRequired();
    if (!validation.valid) {
      await coordinator.respondUsageFromCommand(prefix, command.data, validation);
      return;
    }

    if (command.prefixExecute) {
      await command.prefixExecute(mockInteraction, guildConfig, client);
    } else {
      await command.execute(mockInteraction, guildConfig, client);
    }
  } catch (error) {
    await handleInteractionError(mockInteraction, error, {
      type: 'prefix_command',
      command: command.data?.name,
      source: 'messageAdapter.executePrefixCommand',
    });
  }
}
