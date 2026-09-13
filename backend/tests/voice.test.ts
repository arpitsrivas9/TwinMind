import request from 'supertest';
import app from '../src/app';
import {
  cleanVoiceUtterance,
  detectVoiceIntent,
  isInterruptionIntent,
} from '../src/services/voiceService';
import {
  buildLanguageAndStyleInstructions,
  resolveConversationLanguage,
} from '../src/services/promptService';
import { createToken } from '../src/services/authService';

describe('TwinVoice™ Voice Service & Intent Router', () => {
  describe('isInterruptionIntent', () => {
    it('accurately identifies English stop and pause phrases', () => {
      expect(isInterruptionIntent('Stop')).toBe(true);
      expect(isInterruptionIntent('Stop Buddy')).toBe(true);
      expect(isInterruptionIntent('Wait')).toBe(true);
      expect(isInterruptionIntent('Wait Buddy')).toBe(true);
      expect(isInterruptionIntent('Pause')).toBe(true);
      expect(isInterruptionIntent('Hold on')).toBe(true);
      expect(isInterruptionIntent('One second')).toBe(true);
      expect(isInterruptionIntent("That's enough")).toBe(true);
      expect(isInterruptionIntent('Please stop talking')).toBe(true);
      expect(isInterruptionIntent('Be quiet')).toBe(true);
      expect(isInterruptionIntent('Shhh')).toBe(true);
      expect(isInterruptionIntent('Halt')).toBe(true);
    });

    it('accurately identifies Hindi and Hinglish stop phrases (Devanagari & Roman)', () => {
      expect(isInterruptionIntent('Ruko')).toBe(true);
      expect(isInterruptionIntent('Ruk jao')).toBe(true);
      expect(isInterruptionIntent('Bas')).toBe(true);
      expect(isInterruptionIntent('Bas karo')).toBe(true);
      expect(isInterruptionIntent('Ek minute')).toBe(true);
      expect(isInterruptionIntent('Thoda ruko')).toBe(true);
      expect(isInterruptionIntent('Stop karo')).toBe(true);
      expect(isInterruptionIntent('Band karo')).toBe(true);
      expect(isInterruptionIntent('चुप')).toBe(true);
      expect(isInterruptionIntent('बस')).toBe(true);
      expect(isInterruptionIntent('बस करो')).toBe(true);
      expect(isInterruptionIntent('ठहरो')).toBe(true);
      expect(isInterruptionIntent('रुकिए')).toBe(true);
      expect(isInterruptionIntent('एक मिनट')).toBe(true);
    });

    it('does NOT misclassify general queries or wake words as interruption', () => {
      expect(isInterruptionIntent('Hey Buddy')).toBe(false);
      expect(isInterruptionIntent('Hey Buddy, what was I working on?')).toBe(false);
      expect(isInterruptionIntent('Tell me a joke')).toBe(false);
      expect(isInterruptionIntent('Kahan ho tum?')).toBe(false);
      expect(isInterruptionIntent('')).toBe(false);
    });
  });

  describe('cleanVoiceUtterance', () => {
    it('strips "Hey Buddy" wake word cleanly', () => {
      expect(cleanVoiceUtterance('Hey Buddy, what was I working on yesterday?')).toBe(
        'what was I working on yesterday?',
      );
      expect(cleanVoiceUtterance('hey buddy what is the time')).toBe('what is the time');
      expect(cleanVoiceUtterance('Okay Buddy open settings')).toBe('open settings');
      expect(cleanVoiceUtterance('Buddy, search documents')).toBe('search documents');
    });

    it('strips pleasantries like "please"', () => {
      expect(cleanVoiceUtterance('Hey Buddy please summarize this')).toBe('summarize this');
    });
  });

  describe('detectVoiceIntent', () => {
    it('detects STOP_GENERATION commands across English, Hindi, and Hinglish', () => {
      const r1 = detectVoiceIntent('Hey Buddy, stop!');
      expect(r1.intent).toBe('STOP_GENERATION');

      const r2 = detectVoiceIntent('Stop Buddy');
      expect(r2.intent).toBe('STOP_GENERATION');

      const r3 = detectVoiceIntent('wait stop');
      expect(r3.intent).toBe('STOP_GENERATION');

      const r4 = detectVoiceIntent('be quiet');
      expect(r4.intent).toBe('STOP_GENERATION');

      const r5 = detectVoiceIntent('Ruko');
      expect(r5.intent).toBe('STOP_GENERATION');

      const r6 = detectVoiceIntent('Bas karo');
      expect(r6.intent).toBe('STOP_GENERATION');

      const r7 = detectVoiceIntent('Ek minute');
      expect(r7.intent).toBe('STOP_GENERATION');
    });

    it('detects NEW_CONVERSATION commands', () => {
      const r1 = detectVoiceIntent('Hey Buddy, start a new thought.');
      expect(r1.intent).toBe('NEW_CONVERSATION');

      const r2 = detectVoiceIntent('new conversation');
      expect(r2.intent).toBe('NEW_CONVERSATION');
    });

    it('detects NAVIGATE commands for various modules', () => {
      expect(detectVoiceIntent('Hey Buddy, open my memory').intent).toBe('NAVIGATE');
      expect(detectVoiceIntent('Hey Buddy, open my memory').target).toBe('memory');

      expect(detectVoiceIntent('open settings').intent).toBe('NAVIGATE');
      expect(detectVoiceIntent('open settings').target).toBe('settings');

      expect(detectVoiceIntent('show me knowledge graph').intent).toBe('NAVIGATE');
      expect(detectVoiceIntent('show me knowledge graph').target).toBe('graph');

      expect(detectVoiceIntent('switch to search').intent).toBe('NAVIGATE');
      expect(detectVoiceIntent('switch to search').target).toBe('search');

      expect(detectVoiceIntent('open agents').intent).toBe('NAVIGATE');
      expect(detectVoiceIntent('open agents').target).toBe('agents');
    });

    it('detects REPEAT commands', () => {
      expect(detectVoiceIntent('repeat that').intent).toBe('REPEAT');
      expect(detectVoiceIntent('say that again').intent).toBe('REPEAT');
    });

    it('detects SUMMARIZE commands', () => {
      expect(detectVoiceIntent('summarize this conversation').intent).toBe('SUMMARIZE');
    });

    it('detects AGENT_DISPATCH commands', () => {
      const r = detectVoiceIntent('Hey Buddy, ask the coding agent to refactor auth');
      expect(r.intent).toBe('AGENT_DISPATCH');
      expect(r.target).toBe('coding');
      expect(r.cleanedQuery).toBe('refactor auth');
    });

    it('detects Hindi and Hinglish voice commands accurately', () => {
      expect(detectVoiceIntent('Hey Buddy, ruko!').intent).toBe('STOP_GENERATION');
      expect(detectVoiceIntent('ruk jao').intent).toBe('STOP_GENERATION');
      expect(detectVoiceIntent('band karo').intent).toBe('STOP_GENERATION');
      expect(detectVoiceIntent('cancel kar do').intent).toBe('STOP_GENERATION');

      expect(detectVoiceIntent('Hey Buddy, naya thought shuru karo').intent).toBe('NEW_CONVERSATION');
      expect(detectVoiceIntent('chat clear karo').intent).toBe('NEW_CONVERSATION');

      expect(detectVoiceIntent('phir se bolo').intent).toBe('REPEAT');
      expect(detectVoiceIntent('dobara bolo').intent).toBe('REPEAT');

      expect(detectVoiceIntent('summary batao').intent).toBe('SUMMARIZE');
      expect(detectVoiceIntent('isko summarize karo').intent).toBe('SUMMARIZE');

      expect(detectVoiceIntent('settings kholo').intent).toBe('NAVIGATE');
      expect(detectVoiceIntent('settings kholo').target).toBe('settings');

      expect(detectVoiceIntent('memory kholo').intent).toBe('NAVIGATE');
      expect(detectVoiceIntent('memory kholo').target).toBe('memory');

      expect(detectVoiceIntent('graph dikhao').intent).toBe('NAVIGATE');
      expect(detectVoiceIntent('graph dikhao').target).toBe('graph');
    });

    it('routes general questions to CHAT_QUERY with Twin Core', () => {
      const r = detectVoiceIntent('Hey Buddy, what was I working on yesterday?');
      expect(r.intent).toBe('CHAT_QUERY');
      expect(r.cleanedQuery).toBe('what was I working on yesterday?');

      const rHinglish = detectVoiceIntent('Hey Buddy, kal main kya kaam kar raha tha?');
      expect(rHinglish.intent).toBe('CHAT_QUERY');
      expect(rHinglish.cleanedQuery).toBe('kal main kya kaam kar raha tha?');
    });
  });

  describe('resolveConversationLanguage', () => {
    it('accurately resolves English queries to en and latin script', () => {
      const res = resolveConversationLanguage('Can you explain how vector databases work?');
      expect(res.language).toBe('en');
      expect(res.script).toBe('latin');
      expect(res.isExplicitSwitch).toBe(false);
    });

    it('accurately resolves natural Roman Hinglish queries to hinglish and roman script', () => {
      const res = resolveConversationLanguage('Bhai vector database kaise kaam karta hai simple words me samjhao');
      expect(res.language).toBe('hinglish');
      expect(res.script).toBe('roman');
      expect(res.isExplicitSwitch).toBe(false);
    });

    it('accurately resolves Devanagari Hindi queries to hi and devanagari script', () => {
      const res = resolveConversationLanguage('वेक्टर डेटाबेस कैसे काम करता है? आसान भाषा में समझाइए।');
      expect(res.language).toBe('hi');
      expect(res.script).toBe('devanagari');
      expect(res.isExplicitSwitch).toBe(false);
    });

    it('detects explicit Hinglish switch commands immediately', () => {
      const res1 = resolveConversationLanguage('Abse mujhse Hinglish me baat karo');
      expect(res1.language).toBe('hinglish');
      expect(res1.script).toBe('roman');
      expect(res1.isExplicitSwitch).toBe(true);

      const res2 = resolveConversationLanguage('Switch to Hinglish please');
      expect(res2.language).toBe('hinglish');
      expect(res2.isExplicitSwitch).toBe(true);
    });

    it('detects explicit Hindi switch commands immediately', () => {
      const res = resolveConversationLanguage('Ab Hindi me batao');
      expect(res.language).toBe('hi');
      expect(res.script).toBe('devanagari');
      expect(res.isExplicitSwitch).toBe(true);
    });

    it('detects explicit English switch commands immediately', () => {
      const res = resolveConversationLanguage('Switch to English');
      expect(res.language).toBe('en');
      expect(res.script).toBe('latin');
      expect(res.isExplicitSwitch).toBe(true);
    });

    it('persists conversation language across subsequent turns from history', () => {
      const history = [
        { role: 'USER' as const, content: 'Abse mujhse Hinglish me baat karo' },
        { role: 'ASSISTANT' as const, content: 'Haan bilkul, ab se main Hinglish me baat karunga.' },
      ];

      // Subsequent technical query without explicit switch inherits Hinglish
      const followUp = resolveConversationLanguage('How does caching work?', history);
      expect(followUp.language).toBe('hinglish');
      expect(followUp.script).toBe('roman');
    });

    it('maintains conversational continuity on brief follow-up queries', () => {
      const history = [
        { role: 'USER' as const, content: 'ye kaise kaam karta hai?' },
        { role: 'ASSISTANT' as const, content: 'Dekho, ye aise kaam karta hai...' },
      ];

      const followUp = resolveConversationLanguage('aur aage kya?', history);
      expect(followUp.language).toBe('hinglish');
      expect(followUp.script).toBe('roman');
    });

    it('respects explicit userPreference settings', () => {
      expect(resolveConversationLanguage('hello', [], 'hi').language).toBe('hi');
      expect(resolveConversationLanguage('hello', [], 'hinglish').language).toBe('hinglish');
      expect(resolveConversationLanguage('नमस्ते', [], 'en').language).toBe('en');
    });

    it('accurately resolves prompt language and script for key phrases', () => {
      expect(resolveConversationLanguage('How are you?')).toMatchObject({
        language: 'en',
        script: 'latin',
        isExplicitSwitch: false,
      });

      expect(resolveConversationLanguage('kaise ho?')).toMatchObject({
        language: 'hinglish',
        script: 'roman',
        isExplicitSwitch: false,
      });

      expect(resolveConversationLanguage('mujhe ye simple mein samjhao')).toMatchObject({
        language: 'hinglish',
        script: 'roman',
        isExplicitSwitch: false,
      });

      expect(resolveConversationLanguage('मुझे यह आसान भाषा में समझाओ')).toMatchObject({
        language: 'hi',
        script: 'devanagari',
        isExplicitSwitch: false,
      });

      expect(resolveConversationLanguage('Ye API kaise work karti hai?')).toMatchObject({
        language: 'hinglish',
        script: 'roman',
        isExplicitSwitch: false,
      });

      expect(resolveConversationLanguage('Ab Hindi mein batao')).toMatchObject({
        language: 'hi',
        script: 'devanagari',
        isExplicitSwitch: true,
      });

      expect(resolveConversationLanguage('Ab Hinglish mein batao')).toMatchObject({
        language: 'hinglish',
        script: 'roman',
        isExplicitSwitch: true,
      });

      expect(resolveConversationLanguage('Now explain it in English')).toMatchObject({
        language: 'en',
        script: 'latin',
        isExplicitSwitch: true,
      });
    });
  });

  describe('buildLanguageAndStyleInstructions', () => {
    it('generates natural Hinglish and Roman script instructions', () => {
      const instructions = buildLanguageAndStyleInstructions('hinglish', 'conversational');
      expect(instructions).toContain('USER LANGUAGE PREFERENCE: HINGLISH');
      expect(instructions).toContain('Latin/Roman script');
      expect(instructions).toContain('Kal aap mainly TwinMind ke Agent system par kaam kar rahe the');
      expect(instructions).toContain('Haan, basically ye aise kaam karta hai...');
      expect(instructions).toContain('TECHNICAL TERMS MUST REMAIN IN ENGLISH');
      expect(instructions).toContain('NEVER mention or announce your language choice');
    });

    it('generates Devanagari Hindi instructions with natural peer tone and no ancient jargon', () => {
      const instructions = buildLanguageAndStyleInstructions('hi', 'professional');
      expect(instructions).toContain('USER LANGUAGE PREFERENCE: HI');
      expect(instructions).toContain('Devanagari script');
      expect(instructions).toContain('SPEAKING STYLE: Professional');
      expect(instructions).toContain('AVOID hyper-formal or ancient Sanskritized textbook vocabulary');
      expect(instructions).toContain('हाँ, इसे एक आसान उदाहरण से समझते हैं।');
    });

    it('generates Auto-detection instructions with conversational continuity', () => {
      const instructions = buildLanguageAndStyleInstructions('auto', 'concise');
      expect(instructions).toContain('AUTO-DETECT & MATCH CONVERSATIONAL LANGUAGE & SCRIPT');
      expect(instructions).toContain('SPEAKING STYLE: Direct, concise');
    });

    it('applies resolvedLanguage override instructions when provided in auto mode', () => {
      const instructions = buildLanguageAndStyleInstructions('auto', 'conversational', 'hinglish');
      expect(instructions).toContain('NATURAL URBAN INDIAN CONVERSATIONAL CADENCE');
      expect(instructions).toContain('Iska simple matlab ye hai ki...');
    });
  });
});

describe('TwinVoice™ Backend API Endpoints', () => {
  const mockToken = createToken({
    id: 'user-test-voice-123',
    email: 'voice-tester@twinmind.dev',
    name: 'Voice Tester',
  });

  describe('GET /api/voice/config', () => {
    it('returns voice capabilities and wake word configuration', async () => {
      const res = await request(app).get('/api/voice/config');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.wakeWord).toBe('Hey Buddy');
      expect(res.body.data.localWakeWordSupported).toBe(true);
      expect(res.body.data.streamingTtsSupported).toBe(true);
    });
  });

  describe('POST /api/voice/intent', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app)
        .post('/api/voice/intent')
        .send({ utterance: 'open settings' });
      expect(res.status).toBe(401);
    });

    it('parses valid voice utterance for authenticated user', async () => {
      const res = await request(app)
        .post('/api/voice/intent')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ utterance: 'Hey Buddy, open settings' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intent).toBe('NAVIGATE');
      expect(res.body.data.target).toBe('settings');
    });

    it('returns validation error on empty utterance', async () => {
      const res = await request(app)
        .post('/api/voice/intent')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ utterance: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/voice/transcribe', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app)
        .post('/api/voice/transcribe')
        .attach('audio', Buffer.from('fake audio data'), 'test.webm');
      expect(res.status).toBe(401);
    });

    it('returns error when no audio file is provided', async () => {
      const res = await request(app)
        .post('/api/voice/transcribe')
        .set('Authorization', `Bearer ${mockToken}`);
      expect(res.status).toBe(400);
    });

    it('accepts audio file and returns transcription in test mode', async () => {
      const res = await request(app)
        .post('/api/voice/transcribe')
        .set('Authorization', `Bearer ${mockToken}`)
        .attach('audio', Buffer.from('test audio buffer simulation'), 'speech.webm');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transcript).toBeDefined();
    });
  });
});
