import type { FormEvent } from "react";

interface LoginViewProps {
  loginError: string | null;
  loginUser: string;
  loginPass: string;
  rememberMe: boolean;
  onLogin: (event: FormEvent) => void;
  onLoginUserChange: (value: string) => void;
  onLoginPassChange: (value: string) => void;
  onRememberMeChange: (value: boolean) => void;
}

export function LoginView({
  loginError,
  loginUser,
  loginPass,
  rememberMe,
  onLogin,
  onLoginUserChange,
  onLoginPassChange,
  onRememberMeChange,
}: LoginViewProps) {
  return (
    <main className="dashboard-shell dashboard-shell--reference">
      <div className="aurora aurora--one" />
      <div className="aurora aurora--two" />
      <div className="login-container glass-card">
        <div className="login-header">
          <p className="eyebrow">Vantage Mission Control</p>
          <h1>로그인</h1>
          <p className="hero__copy">운영 콘솔에 접속해 시스템 전환과 Steam / LLM 흐름을 관리하세요.</p>
        </div>
        <form className="login-form" onSubmit={onLogin}>
          {loginError && <div className="alert-card alert-card--bad">{loginError}</div>}
          <div className="form-group">
            <label htmlFor="username">사용자 이름</label>
            <input
              id="username"
              type="text"
              value={loginUser}
              onChange={(e) => onLoginUserChange(e.target.value)}
              placeholder="ID"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              type="password"
              value={loginPass}
              onChange={(e) => onLoginPassChange(e.target.value)}
              placeholder="Password"
            />
          </div>
          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => onRememberMeChange(e.target.checked)}
              />
              <span>로그인 유지 (Remember me)</span>
            </label>
          </div>
          <button type="submit" className="login-button">로그인</button>
        </form>
      </div>
    </main>
  );
}
