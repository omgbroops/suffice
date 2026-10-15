import test from 'ava';
import delay from 'delay';
import Emittery from '../index.js';

test('meta event - works with async emit override in subclass', async t => {
	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			await delay(10);
			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	const events = [];
	emitter.on(Emittery.listenerAdded, event => {
		events.push(event);
	});

	const listener = () => {};
	emitter.on('test', listener);

	await delay(50);
	t.is(events.length, 1);
	t.is(events[0].data.eventName, 'test');
	t.is(events[0].data.listener, listener);
});

test('meta event - listenerRemoved works with async emit override in subclass', async t => {
	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			await delay(10);
			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	const events = [];
	emitter.on(Emittery.listenerRemoved, event => {
		events.push(event);
	});

	const listener = () => {};
	emitter.on('test', listener);
	emitter.off('test', listener);

	await delay(50);
	t.is(events.length, 1);
	t.is(events[0].data.eventName, 'test');
	t.is(events[0].data.listener, listener);
});

test('meta event - concurrent on() calls with async emit override both deliver', async t => {
	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			await delay(10);
			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	const events = [];
	emitter.on(Emittery.listenerAdded, event => {
		events.push(event);
	});

	const listener1 = () => {};
	const listener2 = () => {};
	emitter.on('test', listener1);
	emitter.on('test', listener2);

	await delay(50);
	t.is(events.length, 2);

	const reportedListeners = new Set(events.map(event => event.data.listener));
	t.true(reportedListeners.has(listener1));
	t.true(reportedListeners.has(listener2));

	await t.throwsAsync(emitter.emit(Emittery.listenerAdded), {instanceOf: TypeError});
});

test('meta event - onAny() works with async emit override in subclass', async t => {
	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			await delay(10);
			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	const events = [];
	emitter.on(Emittery.listenerAdded, event => {
		events.push(event);
	});

	const listener = () => {};
	emitter.onAny(listener);

	await delay(50);
	t.is(events.length, 1);
	t.is(events[0].data.eventName, undefined);
	t.is(events[0].data.listener, listener);
});

test('meta event - offAny() works with async emit override in subclass', async t => {
	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			await delay(10);
			return super.emit(eventName, eventData);
		}
	}

	const emitter = new CustomEmittery();
	const events = [];
	emitter.on(Emittery.listenerRemoved, event => {
		events.push(event);
	});

	const listener = () => {};
	emitter.onAny(listener);
	emitter.offAny(listener);

	await delay(50);
	t.is(events.length, 1);
	t.is(events[0].data.eventName, undefined);
	t.is(events[0].data.listener, listener);
});

test('meta event - multiple emitters have independent counters', async t => {
	class CustomEmittery extends Emittery {
		async emit(eventName, eventData) {
			await delay(10);
			return super.emit(eventName, eventData);
		}
	}

	const emitter1 = new CustomEmittery();
	const emitter2 = new CustomEmittery();
	const events1 = [];
	const events2 = [];

	emitter1.on(Emittery.listenerAdded, event => {
		events1.push(event);
	});
	emitter2.on(Emittery.listenerAdded, event => {
		events2.push(event);
	});

	const listener = () => {};
	emitter1.on('test', listener);
	emitter2.on('test', listener);

	await delay(50);
	t.is(events1.length, 1);
	t.is(events2.length, 1);
	t.is(events1[0].data.listener, listener);
	t.is(events2[0].data.listener, listener);

	// Both counters settle independently - userland is blocked on both
	await t.throwsAsync(emitter1.emit(Emittery.listenerAdded), {instanceOf: TypeError});
	await t.throwsAsync(emitter2.emit(Emittery.listenerAdded), {instanceOf: TypeError});
});
