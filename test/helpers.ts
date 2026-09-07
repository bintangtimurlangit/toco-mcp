/** Minimal assertion helpers shared by the offline unit tests. */
let failures = 0;
let checks = 0;

export function assert(condition: boolean, label: string): void {
  checks++;
  if (condition) {
    console.log(`  ✅ ${label}`);
  } else {
    failures++;
    console.error(`  ❌ ${label}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, label: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    assert(
      false,
      `${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`,
    );
  } else {
    assert(true, label);
  }
}

export function section(name: string): void {
  console.log(`\n${name}`);
}

export function finish(suite: string): void {
  console.log(`\n${failures === 0 ? '✅' : '❌'} ${suite}: ${checks - failures}/${checks} passed`);
  if (failures > 0) process.exit(1);
}
