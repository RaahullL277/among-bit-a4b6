/**
 * @module compliance
 * @description Pre-send compliance engine with six sequential gates and
 *              jurisdiction-aware regulation mapping.
 */

const logger = require('../utils/logger');

/* ------------------------------------------------------------------ */
/*  Gate result helpers                                               */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} GateResult
 * @property {boolean} passed
 * @property {string}  gate    - Name of the gate.
 * @property {string}  reason  - Human-readable explanation.
 * @property {'SEND'|'DROP'|'DEFER'|'BLOCK'} action
 */

/**
 * Build a gate result object.
 * @param {boolean} passed
 * @param {string} gate
 * @param {string} reason
 * @param {'SEND'|'DROP'|'DEFER'|'BLOCK'} action
 * @returns {GateResult}
 */
function gateResult(passed, gate, reason, action) {
  return { passed, gate, reason, action };
}

/* ------------------------------------------------------------------ */
/*  Individual gate implementations                                  */
/* ------------------------------------------------------------------ */

/**
 * Gate 1 – Consent verification.
 * Checks that the user has given explicit opt-in for the channel being used.
 */
function consentGate(message) {
  const { user } = message;
  if (!user) {
    return gateResult(false, 'CONSENT', 'User profile missing from message payload', 'DROP');
  }

  const consentChannels = user.consentChannels || [];
  const channel = (message.channel || '').toUpperCase();

  if (!channel) {
    return gateResult(false, 'CONSENT', 'No delivery channel specified', 'DROP');
  }

  if (!consentChannels.includes(channel)) {
    return gateResult(
      false,
      'CONSENT',
      `User has not opted in for channel: ${channel}. Consented channels: [${consentChannels.join(', ')}]`,
      'DROP'
    );
  }

  return gateResult(true, 'CONSENT', 'User has valid consent for channel', 'SEND');
}

/**
 * Gate 2 – DND (Do-Not-Disturb) registry check.
 * Users on the national DND registry must not receive promotional messages.
 */
function dndGate(message) {
  const { user } = message;
  if (!user) {
    return gateResult(false, 'DND', 'User profile missing', 'DROP');
  }

  if (user.isOnDND) {
    const isTransactional = message.messageType === 'TRANSACTIONAL';
    if (isTransactional) {
      return gateResult(true, 'DND', 'User is on DND but message is transactional — allowed', 'SEND');
    }
    return gateResult(false, 'DND', 'User is registered on DND — promotional message blocked', 'DROP');
  }

  return gateResult(true, 'DND', 'User is not on DND registry', 'SEND');
}

/**
 * Gate 3 – Frequency cap enforcement.
 * Ensures the user has not exceeded per-channel daily/weekly limits.
 */
function frequencyCapGate(message) {
  const { user } = message;
  if (!user) {
    return gateResult(false, 'FREQUENCY_CAP', 'User profile missing', 'DEFER');
  }

  const channel = (message.channel || '').toUpperCase();
  const caps = {
    PUSH: { daily: 3, weekly: 12 },
    SMS: { daily: 1, weekly: 4 },
    EMAIL: { daily: 2, weekly: 8 },
    WHATSAPP: { daily: 2, weekly: 6 },
    IN_APP: { daily: 5, weekly: 20 },
  };

  const channelCap = caps[channel] || { daily: 2, weekly: 8 };
  const usage = (user.messageCountToday && user.messageCountToday[channel]) || 0;
  const weeklyUsage = (user.messageCountWeek && user.messageCountWeek[channel]) || 0;

  if (usage >= channelCap.daily) {
    return gateResult(
      false,
      'FREQUENCY_CAP',
      `Daily cap reached for ${channel}: ${usage}/${channelCap.daily}`,
      'DEFER'
    );
  }

  if (weeklyUsage >= channelCap.weekly) {
    return gateResult(
      false,
      'FREQUENCY_CAP',
      `Weekly cap reached for ${channel}: ${weeklyUsage}/${channelCap.weekly}`,
      'DEFER'
    );
  }

  return gateResult(true, 'FREQUENCY_CAP', `Within limits for ${channel}: daily ${usage}/${channelCap.daily}, weekly ${weeklyUsage}/${channelCap.weekly}`, 'SEND');
}

/**
 * Gate 4 – Blackout window enforcement.
 * Blocks messages during defined blackout periods (national holidays, incidents).
 */
function blackoutGate(message) {
  const blackoutWindows = message.blackoutWindows || [];
  const now = message._testNow ? new Date(message._testNow) : new Date();

  for (const window of blackoutWindows) {
    const start = new Date(window.start);
    const end = new Date(window.end);
    if (now >= start && now <= end) {
      return gateResult(
        false,
        'BLACKOUT',
        `Active blackout window: ${window.reason || 'Unspecified'} (${window.start} – ${window.end})`,
        'DEFER'
      );
    }
  }

  return gateResult(true, 'BLACKOUT', 'No active blackout windows', 'SEND');
}

/**
 * Gate 5 – Content policy check.
 * Scans message body for prohibited patterns: PII leakage, dark patterns, restricted terms.
 */
function contentPolicyGate(message) {
  const body = (message.body || '').toLowerCase();
  const subject = (message.subject || '').toLowerCase();
  const combinedText = `${subject} ${body}`;

  const prohibitedPatterns = [
    { pattern: /\b\d{12}\b/, reason: 'Possible Aadhaar number detected' },
    { pattern: /\b\d{10}\b/, reason: 'Possible phone number in message body' },
    { pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/i, reason: 'Possible PAN number detected' },
    { pattern: /only \d+ left|hurry|last chance|act now/i, reason: 'Potential dark pattern / fake scarcity language' },
    { pattern: /password|otp.*is|credit.?card/i, reason: 'Sensitive data pattern detected' },
  ];

  for (const { pattern, reason } of prohibitedPatterns) {
    if (pattern.test(combinedText)) {
      return gateResult(false, 'CONTENT_POLICY', reason, 'BLOCK');
    }
  }

  if (!body || body.trim().length === 0) {
    return gateResult(false, 'CONTENT_POLICY', 'Message body is empty', 'BLOCK');
  }

  if (body.length > 4096) {
    return gateResult(false, 'CONTENT_POLICY', 'Message body exceeds 4096 character limit', 'BLOCK');
  }

  return gateResult(true, 'CONTENT_POLICY', 'Content passed policy checks', 'SEND');
}

/**
 * Gate 6 – Time window enforcement.
 * SMS must only be sent between 9:00 and 21:00 IST. Other channels have softer windows.
 */
function timeWindowGate(message) {
  const now = message._testNow ? new Date(message._testNow) : new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const istHour = istTime.getUTCHours();
  const istMinute = istTime.getUTCMinutes();
  const istDecimal = istHour + istMinute / 60;

  const channel = (message.channel || '').toUpperCase();

  // SMS: strict 9:00-21:00 IST (TRAI regulation)
  if (channel === 'SMS') {
    if (istDecimal < 9 || istDecimal >= 21) {
      return gateResult(
        false,
        'TIME_WINDOW',
        `SMS not permitted outside 9:00-21:00 IST. Current IST time: ${istHour}:${String(istMinute).padStart(2, '0')}`,
        'DEFER'
      );
    }
  }

  // PUSH / WHATSAPP: soft window 8:00-22:00 IST
  if (channel === 'PUSH' || channel === 'WHATSAPP') {
    if (istDecimal < 8 || istDecimal >= 22) {
      return gateResult(
        false,
        'TIME_WINDOW',
        `${channel} deferred outside 8:00-22:00 IST. Current IST time: ${istHour}:${String(istMinute).padStart(2, '0')}`,
        'DEFER'
      );
    }
  }

  return gateResult(true, 'TIME_WINDOW', `Within permitted send window for ${channel || 'unknown channel'}`, 'SEND');
}

/* ------------------------------------------------------------------ */
/*  PreSendInterceptor                                               */
/* ------------------------------------------------------------------ */

/**
 * @class PreSendInterceptor
 * @description Runs all six compliance gates in sequence on a message.
 *              Processing halts on the first failing gate.
 */
class PreSendInterceptor {
  constructor() {
    /**
     * Ordered list of gate functions. Executed sequentially.
     * @type {Array<function(object): GateResult>}
     */
    this.gates = [
      consentGate,
      dndGate,
      frequencyCapGate,
      blackoutGate,
      contentPolicyGate,
      timeWindowGate,
    ];
  }

  /**
   * Run all gates sequentially. Stops at the first failure.
   *
   * @param {object} message
   * @param {object} message.user - User profile with consent, DND, frequency data.
   * @param {string} message.channel - Delivery channel (SMS, EMAIL, PUSH, WHATSAPP, IN_APP).
   * @param {string} message.body - Message body content.
   * @param {string} [message.subject] - Message subject (email).
   * @param {string} [message.messageType] - TRANSACTIONAL or PROMOTIONAL.
   * @param {Array}  [message.blackoutWindows] - Active blackout windows.
   * @returns {{ passed: boolean, results: GateResult[], failedGate: GateResult|null }}
   */
  runAllGates(message) {
    const results = [];
    let failedGate = null;

    for (const gate of this.gates) {
      const result = gate(message);
      results.push(result);

      logger.debug('Compliance gate evaluated', {
        gate: result.gate,
        passed: result.passed,
        action: result.action,
      });

      if (!result.passed) {
        failedGate = result;
        logger.warn('Message blocked by compliance gate', {
          gate: result.gate,
          reason: result.reason,
          action: result.action,
          userId: message.user && message.user.id,
          channel: message.channel,
        });
        break;
      }
    }

    return {
      passed: failedGate === null,
      results,
      failedGate,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Regulation Mapper                                                */
/* ------------------------------------------------------------------ */

/**
 * Regulation definitions with metadata.
 */
const REGULATIONS = Object.freeze({
  TRAI: {
    name: 'TRAI TCCCPR',
    fullName: 'Telecom Commercial Communications Customer Preference Regulations',
    jurisdiction: 'IN',
    applies: 'SMS and voice communications in India',
    requirements: ['DND registry check', 'Consent verification', 'Time window 9-21 IST', 'Content template registration'],
  },
  DPDP: {
    name: 'DPDP Act 2023',
    fullName: 'Digital Personal Data Protection Act',
    jurisdiction: 'IN',
    applies: 'All digital personal data processing in India',
    requirements: ['Lawful purpose', 'Consent', 'Data minimisation', 'Right to erasure', 'Breach notification'],
  },
  IT_ACT: {
    name: 'IT Act 2000',
    fullName: 'Information Technology Act',
    jurisdiction: 'IN',
    applies: 'Electronic communications and data in India',
    requirements: ['Data protection rules', 'Reasonable security practices', 'Intermediary guidelines'],
  },
  CAN_SPAM: {
    name: 'CAN-SPAM Act',
    fullName: 'Controlling the Assault of Non-Solicited Pornography And Marketing Act',
    jurisdiction: 'US',
    applies: 'Commercial email messages in the US',
    requirements: ['Unsubscribe mechanism', 'Accurate sender info', 'Clear identification as ad', 'Physical address'],
  },
  GDPR: {
    name: 'GDPR',
    fullName: 'General Data Protection Regulation',
    jurisdiction: 'EU',
    applies: 'Personal data of EU residents',
    requirements: ['Lawful basis', 'Explicit consent', 'Right to access', 'Right to erasure', 'Data portability', 'DPO appointment', '72h breach notification'],
  },
  CCPA: {
    name: 'CCPA',
    fullName: 'California Consumer Privacy Act',
    jurisdiction: 'US-CA',
    applies: 'Personal information of California residents',
    requirements: ['Right to know', 'Right to delete', 'Right to opt-out of sale', 'Non-discrimination'],
  },
});

/**
 * Map a jurisdiction code to a region for matching.
 * @type {Object<string, string[]>}
 */
const JURISDICTION_REGULATION_MAP = Object.freeze({
  IN: ['TRAI', 'DPDP', 'IT_ACT'],
  US: ['CAN_SPAM'],
  'US-CA': ['CAN_SPAM', 'CCPA'],
  EU: ['GDPR'],
  GB: ['GDPR'], // UK GDPR substantially similar
});

/**
 * @class RegulationMapper
 * @description Maps user jurisdiction to applicable regulations.
 */
class RegulationMapper {
  /**
   * Get all regulations applicable to a jurisdiction.
   * @param {string} jurisdictionCode - e.g. 'IN', 'US', 'EU', 'US-CA'
   * @returns {object[]} Array of regulation objects.
   */
  static getRegulations(jurisdictionCode) {
    const codes = JURISDICTION_REGULATION_MAP[jurisdictionCode] || [];
    return codes.map((code) => ({ code, ...REGULATIONS[code] }));
  }

  /**
   * Get all defined regulations.
   * @returns {object}
   */
  static getAllRegulations() {
    return REGULATIONS;
  }
}

/**
 * Detect which jurisdiction(s) apply to a user based on their profile.
 *
 * @param {object} userProfile
 * @param {string} [userProfile.country] - ISO country code.
 * @param {string} [userProfile.state] - State / region within country.
 * @param {string} [userProfile.phoneCountryCode] - Phone number country code (e.g. '+91').
 * @returns {{ jurisdictions: string[], regulations: object[] }}
 */
function detectJurisdiction(userProfile) {
  const jurisdictions = new Set();

  const country = (userProfile.country || '').toUpperCase();
  const state = (userProfile.state || '').toUpperCase();
  const phoneCode = userProfile.phoneCountryCode || '';

  // Country-based detection
  if (country === 'IN' || phoneCode === '+91') {
    jurisdictions.add('IN');
  }
  if (country === 'US' || phoneCode === '+1') {
    jurisdictions.add('US');
    if (state === 'CA' || state === 'CALIFORNIA') {
      jurisdictions.add('US-CA');
    }
  }
  if (['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'IE', 'PT', 'GR', 'FI', 'SE', 'DK', 'PL', 'CZ', 'RO', 'HU', 'BG', 'HR', 'SK', 'SI', 'LT', 'LV', 'EE', 'CY', 'MT', 'LU'].includes(country)) {
    jurisdictions.add('EU');
  }
  if (country === 'GB') {
    jurisdictions.add('GB');
  }

  // Default to India for Flipkart context if no jurisdiction detected
  if (jurisdictions.size === 0) {
    jurisdictions.add('IN');
  }

  const jurisdictionArray = Array.from(jurisdictions);
  const regulations = [];
  const seen = new Set();

  for (const j of jurisdictionArray) {
    for (const reg of RegulationMapper.getRegulations(j)) {
      if (!seen.has(reg.code)) {
        seen.add(reg.code);
        regulations.push(reg);
      }
    }
  }

  return { jurisdictions: jurisdictionArray, regulations };
}

module.exports = {
  PreSendInterceptor,
  RegulationMapper,
  detectJurisdiction,
  REGULATIONS,
};
