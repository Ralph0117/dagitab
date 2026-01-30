// src/lib/id.js
export function makeId() {
  // works on all devices (Android, iOS, Safari, Chrome)
  return (
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 10)
  );
}
