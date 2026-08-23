// Full-screen stop page shown when the admin has blocked this account —
// either discovered at login/refresh or pushed mid-session via the api()
// 'skeo:blocked' event.
export default function Blocked({ message, onLogout }) {
  return (
    <div className="center">
      <div className="panel blocked-panel">
        <div className="blocked-icon">🚫</div>
        <h2>Account blocked</h2>
        <p className="muted">{message || 'Your account has been blocked by the administrator.'}</p>
        <p className="muted" style={{ fontSize: 13 }}>
          If you believe this is a mistake, please contact your program administrator.
        </p>
        <button className="btn" onClick={onLogout}>Back to login</button>
      </div>
    </div>
  );
}
