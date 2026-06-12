import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const navigate = useNavigate();
  const { login, register, isLoading, error, clearError, token } = useAuthStore();

  useEffect(() => {
    if (token) {
      navigate('/', { replace: true });
    }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (isLogin) {
      await login(email, password);
    } else {
      await register(email, username, password);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-surface-50 to-surface-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl p-8 animate-scale-in">
          <h1 className="text-3xl font-bold text-center text-surface-800 mb-2 tracking-tight">
            WebChat v3
          </h1>
          <p className="text-center text-surface-500 mb-8 text-sm">
            {isLogin ? '欢迎回来' : '创建新账号'}
          </p>

          <div className="flex mb-6 bg-surface-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => { setIsLogin(true); clearError(); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                isLogin
                  ? 'bg-white text-primary-600 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(false); clearError(); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                !isLogin
                  ? 'bg-white text-primary-600 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              注册
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-error-50 border border-error-100 rounded-xl text-error-600 text-sm animate-fade-in">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                邮箱
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 focus:bg-white outline-none transition-all duration-200"
                placeholder="your@email.com"
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  昵称
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={2}
                  className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 focus:bg-white outline-none transition-all duration-200"
                  placeholder="至少2个字符"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 focus:bg-white outline-none transition-all duration-200"
                placeholder="至少6位"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 active:bg-primary-700 focus:ring-4 focus:ring-primary-200 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
            >
              {isLoading ? '处理中...' : isLogin ? '登录' : '注册'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
