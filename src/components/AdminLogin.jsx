import { useState } from 'react';
import '../App.css';
import './AdminLogin.css';
import { ADMIN_PASSWORD } from '../config';

function AdminLogin({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      // Store authentication in localStorage
      localStorage.setItem('adminAuthenticated', 'true');
      setError('');
      onLogin();
    } else {
      setError('Incorrect password. Please try again.');
      setPassword('');
    }
  };

  return (
    <div className="admin-login-container">
      <div className="admin-login-box">
        <h2>Admin Access</h2>
        <p className="admin-login-subtitle">Please enter the password to access the admin panel</p>
        <form onSubmit={handleSubmit}>
          <div className="admin-login-input-group">
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="Enter password"
              className="admin-login-input"
              autoFocus
            />
            {error && <p className="admin-login-error">{error}</p>}
          </div>
          <button type="submit" className="admin-login-button">
            Login
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminLogin;

