import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Mail, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';
import { apiFetch } from '../../services/apiClient';

export const AuthPages: React.FC = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Clear any stale offline token when visiting login page
  React.useEffect(() => {
    const token = localStorage.getItem('teckstudio_auth_token');
    if (token && token.startsWith('offline_')) {
      localStorage.removeItem('teckstudio_auth_token');
      localStorage.removeItem('teckstudio_user');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body = isLogin
      ? { email, password }
      : { name, email, password };

    try {
      const response = await apiFetch(isLogin ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        auth: false,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.detail || 'Something went wrong. Please try again.');
      }

      // Store auth state
      localStorage.setItem('teckstudio_auth_token', data.token);
      localStorage.setItem('teckstudio_user', JSON.stringify(data.user));

      // Redirect to Dashboard
      navigate('/');
    } catch (err: any) {
      localStorage.removeItem('teckstudio_auth_token');
      localStorage.removeItem('teckstudio_user');
      if (err.message.includes('fetch') || err.message.includes('Failed') || err.message.includes('NetworkError')) {
        setError('Unable to reach the backend. Please start the API server and try again.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-[#09090b] flex items-center justify-center font-sans p-6 select-none relative overflow-hidden">
      {/* Decorative Orbs */}
      <div className="absolute -left-20 -top-20 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl" />
      <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-fuchsia-600/10 rounded-full blur-3xl" />

      <div className="w-full max-w-md bg-[#121214] border border-zinc-800 rounded-2xl p-8 shadow-2xl relative z-10">
        {/* Header Logo */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex items-center gap-2 text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
            <Sparkles className="w-8 h-8 text-violet-400 animate-pulse" />
            <span className="font-extrabold text-2xl tracking-wider">TECKSTUDIO</span>
          </div>
          <h2 className="text-zinc-200 text-lg font-bold mt-4">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-zinc-500 text-xs mt-1">
            {isLogin 
              ? 'Enter your credentials to access your design workspace' 
              : 'Sign up to start saving and sharing your creative layouts'}
          </p>
        </div>

        {/* Alert Banner */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3.5 flex items-start gap-2.5 text-xs mb-6 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!isLogin && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-400">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-900/60 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-zinc-200 outline-none transition-colors placeholder:text-zinc-600"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="email"
                required
                placeholder="john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-900/60 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-zinc-200 outline-none transition-colors placeholder:text-zinc-600"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-900/60 border border-zinc-800 focus:border-violet-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-zinc-200 outline-none transition-colors placeholder:text-zinc-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-750 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg hover:shadow-violet-600/10 text-sm focus:outline-none"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {isLogin ? 'Log In' : 'Create Account'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="my-6 border-t border-zinc-800/80" />

        {/* Toggle Mode */}
        <div className="text-center text-xs">
          <span className="text-zinc-500">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
          </span>
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-violet-400 hover:text-violet-300 font-semibold transition-colors cursor-pointer focus:outline-none"
          >
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </div>
      </div>
    </div>
  );
};
