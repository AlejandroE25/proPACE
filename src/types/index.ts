import { WebSocket } from 'ws';

/**
 * Core message structure matching original Python format: "query$$response"
 */
export interface PACEMessage {
  query: string;
  response: string;
}

/**
 * Extended WebSocket with client metadata
 */
export interface PACEClient extends WebSocket {
  id: string;
  connectedAt: Date;
  lastActivity: Date;
}

/**
 * Memory entry in SQLite database
 */
export interface Memory {
  id?: number;
  timestamp: string;
  topic: string;
  content: string;
  importance: number; // 1-10
  metadata?: Record<string, any>;
  tags?: string;
}

/**
 * Conversation message for Claude context
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

/**
 * Subsystem check result
 */
export interface SubsystemStatus {
  name: string;
  isWorking: boolean;
  error?: string;
}

/**
 * Weather response
 */
export interface WeatherData {
  city: string;
  weather: string;
  temp: number;
  feelsLike: number;
}

/**
 * News item
 */
export interface NewsItem {
  title: string;
  link?: string;
  published?: string;
}

/**
 * Wolfram Alpha result
 */
export interface WolframResult {
  query: string;
  shortAnswer: string;
  detailedAnswer: string;
  pods: Array<{
    title: string;
    content: string;
  }>;
  success: boolean;
}

/**
 * Routing subsystem types
 */
export type SubsystemType = 'weather' | 'news' | 'wolfram' | 'claude';

/**
 * Routing decision from intelligent router
 */
export interface RoutingDecision {
  subsystem: SubsystemType;
  confidence: number;
  reasoning?: string;
  cached: boolean;
}

/**
 * Routing cache entry
 */
export interface RoutingCacheEntry {
  subsystem: SubsystemType;
  confidence: number;
  timestamp: number;
  hitCount: number;
}

/**
 * Session routing pattern
 */
export interface SessionPattern {
  clientId: string;
  subsystemHistory: SubsystemType[];
  lastQuery: Date;
  predictedNext?: SubsystemType;
}

/**
 * Configuration interface
 */
export interface PACEConfig {
  port: number;
  host: string;
  nodeEnv: string;
  anthropicApiKey: string;
  openaiApiKey?: string;
  openWeatherMapApiKey: string;
  wolframAlphaAppId: string;
  databasePath: string;
  maxConversationHistory: number;
  memorySearchLimit: number;
  weatherCacheTTL: number;
  newsCacheTTL: number;
  responseCacheTTL: number;
  logLevel: string;
  logFile: string;
  routingCacheTTL: number;
  routingConfidenceThreshold: number;
  routingModel: string;
  enableRoutingPrediction: boolean;
  enableSessionLearning: boolean;

  // Agent System (Phase 1 - Foundation)
  enableAgentMode: boolean;
  agentPlanningModel: string;
  maxExecutionSteps: number;
  executionTimeout: number;
  pluginDirectory: string;
  enablePluginHotReload: boolean;
  pluginTimeout: number;

  // Voice Interface
  enableVoice?: boolean;
  voiceTTSVoice?: string;
  voiceSTTLanguage?: string;
  voiceTTSCacheSize?: number;
  voiceTTSCacheTTL?: number;
  voiceSTTChunkDuration?: number;
  voiceICEServers?: string; // JSON string of ICE servers array
}

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}
