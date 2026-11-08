import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './pwa.js';
import App from './App.jsx';
import './fonts.css';
import './tailwind.css';
import './styles.css';
import './styles/home.css';
import './styles/student-pages.css';
import './styles/learning.css';
import './styles/shell.css';
import './styles/usage.css';
import './styles/vdo-check.css';
import './styles/player.css';
import './styles/updates.css';
import './styles/reviews.css';
import './styles/quiz.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
