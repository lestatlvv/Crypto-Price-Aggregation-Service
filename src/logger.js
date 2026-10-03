'use strict';

function timestamp() {
  return new Date().toISOString();
}

function formatArg(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function write(print, args) {
  const prefix = `[${timestamp()}]`;
  const text = args.map(formatArg).join(' ');

  for (const line of text.split('\n')) {
    print(`${prefix} ${line}`);
  }
}

function log(...args) {
  write(console.log, args);
}

function error(...args) {
  write(console.error, args);
}

function event(name, fields = {}) {
  log({ event: name, ...fields });
}

module.exports = {
  log,
  error,
  event
};
