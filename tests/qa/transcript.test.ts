import { describe, expect, it } from 'vitest';
import { mapTranscript, tidy, withTypedQuestions, type RawTranscriptItem } from '@/lib/qa/transcript';

const item = (over: Partial<RawTranscriptItem>): RawTranscriptItem => ({ uid: '123', turn_id: 1, stream_id: 0, _time: 1000, text: 'hello', status: 1, ...over });

describe('mapTranscript', () => {
  it('calls the agent the presenter and everyone else you', () => {
    const lines = mapTranscript([item({ uid: '123', _time: 1 }), item({ uid: '9100', turn_id: 2, _time: 2, text: 'hi' })], '9100');
    expect(lines.map((l) => l.who)).toEqual(['you', 'presenter']);
  });

  it('marks a turn that is still going as not final', () => {
    expect(mapTranscript([item({ status: 0 })], '9100')[0].final).toBe(false);
    expect(mapTranscript([item({ status: 2 })], '9100')[0].final).toBe(true);
  });

  it('drops empty turns, trims text, and orders by time', () => {
    const lines = mapTranscript([item({ _time: 5, text: ' later ' }), item({ turn_id: 2, text: '  ' }), item({ turn_id: 3, _time: 2, text: 'earlier' })], '9100');
    expect(lines.map((l) => l.text)).toEqual(['earlier', 'later']);
  });

  it('gives each turn its own id', () => {
    const ids = mapTranscript([item({ turn_id: 1 }), item({ turn_id: 2 })], '9100').map((l) => l.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('stage cues', () => {
  it('are not shown in the conversation, whoever the transcript says sent them', () => {
    const lines = mapTranscript([item({ text: '[Stage cue] Present slide 2 of 4 now.' }), item({ turn_id: 2, text: 'Real question', _time: 2 })], '9100');
    expect(lines.map((l) => l.text)).toEqual(['Real question']);
  });
});

describe('tidy', () => {
  it('adds the space the agent\'s text chunks leave out after punctuation', () => {
    expect(tidy("We have 48,000 active users now,which is up 32 percent.Churn is down to 2.1 percent.")).toBe(
      'We have 48,000 active users now, which is up 32 percent. Churn is down to 2.1 percent.',
    );
  });
  it('leaves numbers, decimals and thousands separators alone', () => {
    expect(tidy('Up 2.1% to 48,000 by 3:30.')).toBe('Up 2.1% to 48,000 by 3:30.');
  });
  it('collapses extra spaces', () => {
    expect(tidy('  a   b  ')).toBe('a b');
  });
});

describe('withTypedQuestions', () => {
  const typed = [{ id: 't1', who: 'you' as const, text: 'How many users?', final: true, at: 500 }];

  it('adds a typed question in time order', () => {
    const lines = mapTranscript([item({ uid: '9100', _time: 900, text: '48,000' })], '9100');
    expect(withTypedQuestions(lines, typed).map((l) => l.text)).toEqual(['How many users?', '48,000']);
  });

  it('does not show a question twice when the transcript already echoes it', () => {
    const lines = mapTranscript([item({ uid: '123', _time: 510, text: 'how many users?' })], '9100');
    expect(withTypedQuestions(lines, typed)).toHaveLength(1);
  });
});
