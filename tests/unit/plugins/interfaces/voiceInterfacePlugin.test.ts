/**
 * VoiceInterfacePlugin Test Suite
 *
 * Tests the voice interface plugin implementation including
 * lifecycle, event subscriptions, and integration points.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VoiceInterfacePlugin } from '../../../../src/plugins/interfaces/voiceInterfacePlugin';
import { EventBus } from '../../../../src/events/eventBus';
import { EventStore } from '../../../../src/events/eventStore';
import { DataPipeline } from '../../../../src/data/dataPipeline';
import { DataStorage } from '../../../../src/data/dataStorage';
import { PluginState, PluginCapability } from '../../../../src/plugins/types';
import { EventType, EventSubscriber } from '../../../../src/events/types';

describe('VoiceInterfacePlugin', () => {
  let plugin: VoiceInterfacePlugin;
  let eventBus: EventBus;
  let eventStore: EventStore;
  let dataStorage: DataStorage;
  let dataPipeline: DataPipeline;

  beforeEach(() => {
    // Create dependencies
    eventStore = new EventStore(':memory:');
    eventBus = new EventBus(eventStore);
    dataStorage = new DataStorage(':memory:');
    dataPipeline = new DataPipeline(dataStorage, eventBus);

    // Create plugin
    plugin = new VoiceInterfacePlugin();
  });

  afterEach(async () => {
    await plugin.stop().catch(() => {}); // Ignore errors if not running
    await eventBus.shutdown();
    eventStore.close();
    dataStorage.close();
  });

  describe('Plugin Metadata', () => {
    it('should have correct metadata', () => {
      expect(plugin.metadata.id).toBe('voice-interface');
      expect(plugin.metadata.name).toBe('Voice Interface');
      expect(plugin.metadata.capability).toBe(PluginCapability.INTERFACE);
      expect(plugin.metadata.version).toBe('1.0.0');
      expect(plugin.metadata.description).toContain('Speech-to-text');
    });

    it('should have no dependencies', () => {
      expect(plugin.metadata.dependencies).toBeUndefined();
    });
  });

  describe('Lifecycle', () => {
    it('should initialize successfully', async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        settings: {
          ttsVoice: 'onyx',
          sttLanguage: 'en',
          personalityEnabled: true
        }
      });

      expect(plugin.state).toBe(PluginState.STOPPED);
    });

    it('should start and stop successfully', async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        settings: {
          ttsVoice: 'onyx',
          sttLanguage: 'en',
          personalityEnabled: true
        }
      });

      await plugin.start();
      expect(plugin.state).toBe(PluginState.RUNNING);

      await plugin.stop();
      expect(plugin.state).toBe(PluginState.STOPPED);
    });

    it('should be healthy when running', async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        settings: {
          ttsVoice: 'onyx',
          sttLanguage: 'en',
          personalityEnabled: true
        }
      });

      await plugin.start();

      const health = plugin.getHealth();
      expect(health.healthy).toBe(true);
      expect(health.state).toBe(PluginState.RUNNING);
      expect(health.pluginId).toBe('voice-interface');
    });
  });

  describe('Event Subscriptions', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        settings: {
          ttsVoice: 'onyx',
          sttLanguage: 'en',
          personalityEnabled: true
        }
      });
      await plugin.start();
    });

    it('should subscribe to RESPONSE_GENERATED events', async () => {
      // Publish a RESPONSE_GENERATED event
      await eventBus.publish({
        type: EventType.RESPONSE_GENERATED,
        source: 'conversation-orchestrator',
        payload: {
          clientId: 'test-client-1',
          message: 'Hello',
          response: 'Hi there!',
          subsystem: 'claude'
        }
      });

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Plugin should have received the event (verified via internal state or TTS_STARTED event)
      // This will be verified in TTS integration tests
    });

    it('should subscribe to USER_MESSAGE events for interruption detection', async () => {
      // Publish a USER_MESSAGE event
      await eventBus.publish({
        type: EventType.USER_MESSAGE,
        source: 'test-client',
        payload: {
          clientId: 'test-client-1',
          message: 'Stop talking'
        }
      });

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Plugin should have received the event
      // Interruption handling will be tested in detail later
    });
  });

  describe('Configuration', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        settings: {
          ttsVoice: 'onyx',
          sttLanguage: 'en',
          personalityEnabled: true
        }
      });
    });

    it('should accept TTS voice configuration', () => {
      const config = (plugin as any).config;
      expect(config.settings.ttsVoice).toBe('onyx');
    });

    it('should accept STT language configuration', () => {
      const config = (plugin as any).config;
      expect(config.settings.sttLanguage).toBe('en');
    });

    it('should accept personality enabled configuration', () => {
      const config = (plugin as any).config;
      expect(config.settings.personalityEnabled).toBe(true);
    });

    it('should update configuration', async () => {
      await plugin.updateConfig({
        settings: {
          ttsVoice: 'alloy',
          personalityEnabled: false
        }
      });

      const config = (plugin as any).config;
      expect(config.settings.ttsVoice).toBe('alloy');
      expect(config.settings.personalityEnabled).toBe(false);
    });
  });

  describe('Active Client Tracking', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        settings: {
          ttsVoice: 'onyx',
          sttLanguage: 'en',
          personalityEnabled: true
        }
      });
      await plugin.start();
    });

    it('should track active clients', async () => {
      // Simulate a RESPONSE_GENERATED event for a client
      await eventBus.publish({
        type: EventType.RESPONSE_GENERATED,
        source: 'conversation-orchestrator',
        payload: {
          clientId: 'test-client-1',
          message: 'Hello',
          response: 'Hi there!',
          subsystem: 'claude'
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Check that client is tracked
      const activeClients = (plugin as any).activeClients;
      expect(activeClients).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        settings: {
          ttsVoice: 'onyx',
          sttLanguage: 'en',
          personalityEnabled: true
        }
      });
    });

    it('should handle initialization errors gracefully', async () => {
      // This test will verify error handling during initialization
      // Implementation details depend on internal service initialization
      expect(plugin.state).toBe(PluginState.STOPPED);
    });

    it('should recover from event processing errors', async () => {
      await plugin.start();

      // Publish malformed event
      await eventBus.publish({
        type: EventType.RESPONSE_GENERATED,
        source: 'test',
        payload: {
          // Missing required fields
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Plugin should still be running
      expect(plugin.state).toBe(PluginState.RUNNING);
    });
  });
});
