import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            borderRadius: '18px',
            background: '#14261f',
            color: '#f5f4ea',
            border: '1px solid rgba(174, 198, 152, 0.24)'
          }
        }}
      />
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
