import {appendFile} from 'node:fs/promises';

const createNodeWriter = ({eventPath}) => ({
  append: line => appendFile(eventPath, line, {mode: 0o600}),
});

export function createReceiptLog(home, eventPath, createWriter = createNodeWriter, onError) {
  let writer, firstError;
  let tail = Promise.resolve();
  return {
    get error() { return firstError; },
    get tail() { return tail; },
    log(event) {
      tail = tail.then(() => {
        // Pi supplies mutable objects. Their state and the timestamp are sampled
        // when this entry reaches the head of the write queue.
        const line = JSON.stringify({at: new Date().toISOString(), ...event}) + '\n';
        writer ??= createWriter({home, eventPath});
        return writer.append(line);
      }).catch(error => {
        firstError ??= error;
        onError();
      });
    },
    async drain(operation) {
      await tail;
      try {
        if (writer?.[operation]) await writer[operation]();
      } catch (error) {
        firstError ??= error;
      }
      if (firstError) throw firstError;
    },
  };
}
