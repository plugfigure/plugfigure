export function env(variableName) {
  return process.env[variableName];
}

export function json_env(variableName) {
  const raw = env(variableName);
  if (!raw) return {};
  return JSON.parse(raw);
}

