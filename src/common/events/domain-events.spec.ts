import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitterModule, EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Injectable } from '@nestjs/common';
import { DomainEvents, MatchFinishedEvent, MatchEventCreatedEvent } from './index';
import { MatchStatus, EventType } from '@prisma/client';

@Injectable()
class TestEventListener {
  public finishedEvents: MatchFinishedEvent[] = [];
  public createdEvents: MatchEventCreatedEvent[] = [];

  @OnEvent(DomainEvents.MATCH_FINISHED)
  handleFinished(event: MatchFinishedEvent) {
    this.finishedEvents.push(event);
  }

  @OnEvent(DomainEvents.MATCH_EVENT_CREATED)
  handleCreated(event: MatchEventCreatedEvent) {
    this.createdEvents.push(event);
  }
}

describe('Domain Events Bus (EventEmitter2)', () => {
  let eventEmitter: EventEmitter2;
  let listener: TestEventListener;
  let app: TestingModule;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: true })],
      providers: [TestEventListener],
    }).compile();

    await app.init();

    eventEmitter = app.get<EventEmitter2>(EventEmitter2);
    listener = app.get<TestEventListener>(TestEventListener);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    listener.finishedEvents = [];
    listener.createdEvents = [];
  });

  it('should trigger the listener when match.finished is emitted', () => {
    const eventPayload = new MatchFinishedEvent(
      'match-123',
      'phase-456',
      2,
      1,
      'entry-123',
      MatchStatus.FINISHED,
    );

    eventEmitter.emit(DomainEvents.MATCH_FINISHED, eventPayload);

    expect(listener.finishedEvents.length).toBe(1);
    expect(listener.finishedEvents[0]).toEqual(eventPayload);
    expect(listener.finishedEvents[0].matchId).toBe('match-123');
    expect(listener.finishedEvents[0].status).toBe(MatchStatus.FINISHED);
  });

  it('should trigger the listener when match.event.created is emitted', () => {
    const eventPayload = new MatchEventCreatedEvent(
      'match-123',
      'event-789',
      EventType.GOAL,
      1,
      'entry-123',
      'athlete-999',
      { minute: 10 },
      1,
      0,
    );

    eventEmitter.emit(DomainEvents.MATCH_EVENT_CREATED, eventPayload);

    expect(listener.createdEvents.length).toBe(1);
    expect(listener.createdEvents[0]).toEqual(eventPayload);
    expect(listener.createdEvents[0].type).toBe(EventType.GOAL);
  });
});
