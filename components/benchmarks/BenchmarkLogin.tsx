import { useState } from 'react';

export default function BenchmarkLogin({ onLogin, error }: { onLogin: (username: string, password: string) => void, error?: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onLogin(username, password);
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <form onSubmit={handleSubmit} className="bg-gray-900 p-8 rounded-lg shadow-lg border border-gray-800 w-full max-w-xs flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white mb-2 text-center">Benchmarks Login</h2>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="px-3 py-2 rounded bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-600"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="px-3 py-2 rounded bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-600"
          required
        />
        {error && <div className="text-red-500 text-xs text-center">{error}</div>}
        <button
          type="submit"
          className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 rounded transition-colors disabled:opacity-60"
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
}
