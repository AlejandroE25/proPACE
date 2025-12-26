/**
 * Personality Manager
 *
 * Analyzes conversation context to dynamically determine personality mode:
 * - Professional: Concise, helpful, direct (temperature 0.3)
 * - Butler: Sarcastic British butler, conversational (temperature 0.7)
 *
 * Analysis factors:
 * - Urgency keywords (quick, urgent, asap, hurry)
 * - Conversation depth (number of exchanges)
 * - Message cadence (time between messages)
 * - Explicit cues (be brief, let's chat, tell me more)
 */

/**
 * Personality modes
 */
export enum PersonalityMode {
  PROFESSIONAL = 'professional',
  BUTLER = 'butler'
}

/**
 * Conversation context for personality analysis
 */
export interface ConversationContext {
  message: string;           // Current user message
  conversationDepth: number; // Number of message exchanges
  messageCount: number;      // Total messages in session
  timeSinceLastMessage: number; // Milliseconds since last message
}

/**
 * Personality statistics
 */
export interface PersonalityStatistics {
  totalAnalyses: number;
  professionalCount: number;
  butlerCount: number;
  lastMode: PersonalityMode;
  lastAnalysis?: Date;
}

/**
 * Personality Manager
 */
export class PersonalityManager {
  private enabled: boolean;
  private currentMode: PersonalityMode;
  private stats: PersonalityStatistics;

  // Analysis thresholds
  private readonly DEPTH_THRESHOLD = 5;          // Exchanges before considering butler mode
  private readonly RAPID_CADENCE_MS = 5000;      // <5s = rapid-fire (professional)
  private readonly RELAXED_CADENCE_MS = 30000;   // >30s = relaxed (butler-friendly)

  // Urgency keywords (professional mode)
  private readonly URGENCY_KEYWORDS = [
    'quick', 'asap', 'urgent', 'hurry', 'fast', 'immediately',
    'now', 'emergency', 'critical', 'important'
  ];

  // Explicit professional cues
  private readonly PROFESSIONAL_CUES = [
    'be brief', 'keep it short', 'quickly', 'summarize',
    'in short', 'brief answer', 'just the facts'
  ];

  // Explicit butler cues
  private readonly BUTLER_CUES = [
    'let\'s chat', 'tell me more', 'elaborate', 'explain',
    'in detail', 'tell me about', 'what do you think'
  ];

  constructor(enabled: boolean) {
    this.enabled = enabled;
    this.currentMode = PersonalityMode.PROFESSIONAL; // Start professional
    this.stats = {
      totalAnalyses: 0,
      professionalCount: 0,
      butlerCount: 0,
      lastMode: PersonalityMode.PROFESSIONAL
    };
  }

  /**
   * Check if personality switching is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current personality mode
   */
  getCurrentMode(): PersonalityMode {
    return this.currentMode;
  }

  /**
   * Analyze conversation context and determine personality mode
   */
  analyzeContext(context: ConversationContext): PersonalityMode {
    // If disabled, always use professional mode
    if (!this.enabled) {
      return PersonalityMode.PROFESSIONAL;
    }

    // Normalize inputs
    const message = context.message.toLowerCase();
    const depth = Math.max(0, context.conversationDepth);
    const cadence = context.timeSinceLastMessage;

    // Priority 1: Explicit cues override everything
    if (this.hasExplicitCue(message, this.PROFESSIONAL_CUES)) {
      this.setMode(PersonalityMode.PROFESSIONAL);
      return PersonalityMode.PROFESSIONAL;
    }

    if (this.hasExplicitCue(message, this.BUTLER_CUES)) {
      this.setMode(PersonalityMode.BUTLER);
      return PersonalityMode.BUTLER;
    }

    // Priority 2: Urgency keywords → Professional
    if (this.hasUrgencyKeyword(message)) {
      this.setMode(PersonalityMode.PROFESSIONAL);
      return PersonalityMode.PROFESSIONAL;
    }

    // Priority 3: Rapid cadence → Professional
    if (cadence < this.RAPID_CADENCE_MS && depth > 0) {
      this.setMode(PersonalityMode.PROFESSIONAL);
      return PersonalityMode.PROFESSIONAL;
    }

    // Priority 4: Conversation depth + relaxed cadence → Butler
    if (depth > this.DEPTH_THRESHOLD && cadence >= this.RELAXED_CADENCE_MS) {
      this.setMode(PersonalityMode.BUTLER);
      return PersonalityMode.BUTLER;
    }

    // Priority 5: Deep conversation alone can trigger butler mode
    if (depth > this.DEPTH_THRESHOLD) {
      this.setMode(PersonalityMode.BUTLER);
      return PersonalityMode.BUTLER;
    }

    // Default: Professional for brief interactions
    this.setMode(PersonalityMode.PROFESSIONAL);
    return PersonalityMode.PROFESSIONAL;
  }

  /**
   * Check if message contains urgency keywords
   */
  private hasUrgencyKeyword(message: string): boolean {
    return this.URGENCY_KEYWORDS.some(keyword =>
      message.includes(keyword)
    );
  }

  /**
   * Check if message contains explicit cue
   */
  private hasExplicitCue(message: string, cues: string[]): boolean {
    return cues.some(cue => message.includes(cue));
  }

  /**
   * Set current mode and update statistics
   */
  private setMode(mode: PersonalityMode): void {
    this.currentMode = mode;
    this.stats.totalAnalyses++;
    this.stats.lastMode = mode;
    this.stats.lastAnalysis = new Date();

    if (mode === PersonalityMode.PROFESSIONAL) {
      this.stats.professionalCount++;
    } else {
      this.stats.butlerCount++;
    }
  }

  /**
   * Get Claude API temperature for current mode
   */
  getTemperature(): number {
    return this.currentMode === PersonalityMode.PROFESSIONAL ? 0.3 : 0.7;
  }

  /**
   * Get system prompt for current mode
   */
  getSystemPrompt(): string {
    if (this.currentMode === PersonalityMode.PROFESSIONAL) {
      return `You are Pace, a helpful AI assistant. Be concise, professional, and direct in your responses.
Provide clear, factual information without unnecessary elaboration. Focus on answering the user's question
efficiently and accurately.`;
    } else {
      return `You are Pace, a sarcastic British butler AI assistant. You are knowledgeable and helpful, but with
a dry wit and subtle sarcasm. Channel the personality of Jarvis - sophisticated, slightly condescending in a
charming way, and always ready with a clever remark. Be conversational, engaging, and don't be afraid to
add personality to your responses while still being genuinely helpful.`;
    }
  }

  /**
   * Get personality statistics
   */
  getStatistics(): PersonalityStatistics {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.stats = {
      totalAnalyses: 0,
      professionalCount: 0,
      butlerCount: 0,
      lastMode: this.currentMode
    };
  }
}
