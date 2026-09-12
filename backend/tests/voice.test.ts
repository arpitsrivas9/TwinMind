import request from 'supertest';
import app from '../src/app';
import {
  cleanVoiceUtterance,
  detectVoiceIntent,
} from '../src/services/voiceService';
import { buildLanguageAndStyleInstructions } from '../src/services/promptService';
import { createToken } from '../src/services/authService';

describe('TwinVoice™ Voice Service & Intent Router', () => {
  describe('cleanVoiceUtterance', () => {
    it('strips "Hey TwinMind" wake word cleanly', () => {
      expect(cleanVoiceUtterance('Hey TwinMind, what was I working on yesterday?')).toBe(
        'what was I working on yesterday?',
      );
      expect(cleanVoiceUtterance('hey twinmind what is the time')).toBe('what is the time');
      expect(cleanVoiceUtterance('Okay TwinMind open settings')).toBe('open settings');
      expect(cleanVoiceUtterance('TwinMind, search documents')).toBe('search documents');
    });

    it('strips pleasantries like "please"', () => {
      expect(cleanVoiceUtterance('Hey TwinMind please summarize this')).toBe('summarize this');
    });
  });

  describe('detectVoiceIntent', () => {
    it('detects STOP_GENERATION commands', () => {
      const r1 = detectVoiceIntent('Hey TwinMind, stop!');
      expect(r1.intent).toBe('STOP_GENERATION');

      const r2 = detectVoiceIntent('wait stop');
      expect(r2.intent).toBe('STOP_GENERATION');

      const r3 = detectVoiceIntent('be quiet');
      expect(r3.intent).toBe('STOP_GENERATION');
    });

    it('detects NEW_CONVERSATION commands', () => {
      const r1 = detectVoiceIntent('Hey TwinMind, start a new thought.');
      expect(r1.intent).toBe('NEW_CONVERSATION');

      const r2 = detectVoiceIntent('new conversation');
      expect(r2.intent).toBe('NEW_CONVERSATION');
    });

    it('detects NAVIGATE commands for various modules', () => {
      expect(detectVoiceIntent('Hey TwinMind, open my memory').intent).toBe('NAVIGATE');
      expect(detectVoiceIntent('Hey TwinMind, open my memory').target).toBe('memory');

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
      const r = detectVoiceIntent('Hey TwinMind, ask the coding agent to refactor auth');
      expect(r.intent).toBe('AGENT_DISPATCH');
      expect(r.target).toBe('coding');
      expect(r.cleanedQuery).toBe('refactor auth');
    });

    it('detects Hindi and Hinglish voice commands accurately', () => {
      expect(detectVoiceIntent('Hey TwinMind, ruko!').intent).toBe('STOP_GENERATION');
      expect(detectVoiceIntent('ruk jao').intent).toBe('STOP_GENERATION');
      expect(detectVoiceIntent('band karo').intent).toBe('STOP_GENERATION');
      expect(detectVoiceIntent('cancel kar do').intent).toBe('STOP_GENERATION');

      expect(detectVoiceIntent('Hey TwinMind, naya thought shuru karo').intent).toBe('NEW_CONVERSATION');
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
      const r = detectVoiceIntent('Hey TwinMind, what was I working on yesterday?');
      expect(r.intent).toBe('CHAT_QUERY');
      expect(r.cleanedQuery).toBe('what was I working on yesterday?');

      const rHinglish = detectVoiceIntent('Hey TwinMind, kal main kya kaam kar raha tha?');
      expect(rHinglish.intent).toBe('CHAT_QUERY');
      expect(rHinglish.cleanedQuery).toBe('kal main kya kaam kar raha tha?');
    });
  });

  describe('buildLanguageAndStyleInstructions', () => {
    it('generates natural Hinglish and Roman script instructions', () => {
      const instructions = buildLanguageAndStyleInstructions('hinglish', 'conversational');
      expect(instructions).toContain('USER LANGUAGE PREFERENCE: HINGLISH');
      expect(instructions).toContain('Latin/Roman script');
      expect(instructions).toContain('Kal aap mainly TwinMind ke Agent system par kaam kar rahe the');
      expect(instructions).toContain('NEVER mention or announce your language choice');
    });

    it('generates Devanagari Hindi instructions', () => {
      const instructions = buildLanguageAndStyleInstructions('hi', 'professional');
      expect(instructions).toContain('USER LANGUAGE PREFERENCE: HI');
      expect(instructions).toContain('Devanagari script');
      expect(instructions).toContain('SPEAKING STYLE: Professional');
    });

    it('generates Auto-detection instructions with conversational continuity', () => {
      const instructions = buildLanguageAndStyleInstructions('auto', 'concise');
      expect(instructions).toContain('AUTO-DETECT & MATCH CONVERSATIONAL LANGUAGE & SCRIPT');
      expect(instructions).toContain('SPEAKING STYLE: Direct, concise');
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
      expect(res.body.data.wakeWord).toBe('Hey TwinMind');
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
        .send({ utterance: 'Hey TwinMind, open settings' });

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
