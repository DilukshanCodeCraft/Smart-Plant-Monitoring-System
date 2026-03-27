import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ActionButton } from '../components/ActionButton';
import CameraCapture from '../components/CameraCapture';
import { SectionCard } from '../components/SectionCard';
import { getDoctorResponse } from '../lib/geminiService';
import { readBlobAsDataUrl, splitDataUrl } from '../lib/mediaHelpers';
import { api } from '../lib/api';

const INITIAL_MESSAGE = {
  role: 'assistant',
  content: 'Hello, I am Doctor Bloom. Share a plant question or attach a photo and I will help you reason through the symptoms.'
};

function PlantDoctorPage() {
  const chatEndRef = useRef(null);
  const imageInputRef = useRef(null);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [attachedImage, setAttachedImage] = useState('');

  // ── Sync History on Mount ──────────────────────────────────────────────────
  useEffect(() => {
    async function syncChat() {
      try {
        const res = await api.getLatestChat();
        if (res.success && res.data) {
          setActiveChatId(res.data._id);
          setMessages(res.data.messages.length > 0 ? res.data.messages : [INITIAL_MESSAGE]);
        }
      } catch (e) {
        console.warn('Could not load chat history.', e);
      }
    }
    syncChat();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, attachedImage]);

  async function attachImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file.');
      return;
    }
    setAttachedImage(await readBlobAsDataUrl(file));
  }

  async function handleSend() {
    if (!input.trim() && !attachedImage) return;

    const userMsg = {
      role: 'user',
      content: input.trim() || 'Please analyze the attached plant image.',
      image: attachedImage || undefined
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setAttachedImage('');
    setLoading(true);

    try {
      // 1. Ensure a chat exists in DB
      let chatId = activeChatId;
      if (!chatId) {
        const res = await api.createChat({ messages: [userMsg] });
        if (res.success) {
          chatId = res.data._id;
          setActiveChatId(chatId);
        }
      } else {
        await api.addChatMessage(chatId, userMsg);
      }

      // 2. Get AI Response
      const imagePayload = userMsg.image ? splitDataUrl(userMsg.image) : null;
      const replyContent = await getDoctorResponse(
        userMsg.content,
        imagePayload?.base64,
        imagePayload?.mimeType
      );

      const assistantMsg = { role: 'assistant', content: replyContent };
      setMessages([...newMessages, assistantMsg]);
      
      // 3. Save AI response to DB
      if (chatId) {
        await api.addChatMessage(chatId, assistantMsg);
      }

    } catch (doctorError) {
      console.error(doctorError);
      toast.error('Doctor Bloom is currently thinking... try again later.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel hero-panel--analytics">
        <div>
          <span className="hero-panel__eyebrow">Conversational Plant Care</span>
          <h1>Doctor Bloom</h1>
          <p>
            Ask plant-care questions or share a photo. Your chat history is now automatically synced with the database.
          </p>
          <div className="control-cluster">
            <ActionButton tone="mint" onClick={() => setShowCamera(true)}>
              Attach Camera Photo
            </ActionButton>
            <ActionButton tone="sky" onClick={() => imageInputRef.current?.click()}>
              Upload Photo
            </ActionButton>
          </div>
        </div>
      </section>

      <div className="section-grid">
        <SectionCard title="Bloom Chat" eyebrow="Expert conversational diagnosis">
          <div className="chat-container">
            <div className="chat-log" role="log" aria-live="polite">
              {messages.map((m, idx) => (
                <div key={idx} className={`chat-bubble chat-bubble--${m.role}`}>
                  <div className="chat-bubble__header">
                    <strong>{m.role === 'user' ? 'You' : 'Doctor Bloom'}</strong>
                    <span className="chat-timestamp">{m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ''}</span>
                  </div>
                  {m.image && <img src={m.image} alt="User submission" className="chat-thumb" />}
                  <div className="chat-bubble__content">{m.content}</div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="chat-controls">
              {attachedImage && (
                <div className="thumb-preview">
                  <img src={attachedImage} alt="Attachment" />
                  <button className="close-btn" onClick={() => setAttachedImage('')}>&times;</button>
                </div>
              )}
              <div className="chat-input-row">
                <input
                  type="text"
                  placeholder="Ask a question..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  disabled={loading}
                />
                <ActionButton tone="sky" busy={loading} onClick={handleSend} disabled={loading}>
                  Send
                </ActionButton>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <input
        type="file"
        ref={imageInputRef}
        className="hidden-file-input"
        accept="image/*"
        onChange={(e) => attachImageFile(e.target.files[0])}
      />

      {showCamera && (
        <div className="modal-overlay">
          <div className="modal-content">
            <header className="modal-header">
              <h2>Capture Symptom Photo</h2>
              <button className="close-btn" onClick={() => setShowCamera(false)}>&times;</button>
            </header>
            <CameraCapture
              onCapture={(blob) => {
                attachImageFile(blob);
                setShowCamera(false);
              }}
            />
          </div>
        </div>
      )}

      <style>{`
        .chat-container { display: flex; flex-direction: column; height: 600px; }
        .chat-log { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1.5rem; background: var(--bg-tertiary); border-radius: 12px; margin-bottom: 1rem; }
        .chat-bubble { max-width: 85%; padding: 1rem; border-radius: 12px; line-height: 1.5; }
        .chat-bubble--user { align-self: flex-end; background: var(--primary); color: white; border-bottom-right-radius: 4px; }
        .chat-bubble--assistant { align-self: flex-start; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-bottom-left-radius: 4px; }
        .chat-bubble__header { display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 0.25rem; opacity: 0.7; }
        .chat-thumb { max-width: 100%; border-radius: 8px; margin: 0.5rem 0; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        .chat-controls { background: var(--bg-secondary); padding: 1rem; border-radius: 12px; border: 1px solid var(--border-subtle); }
        .chat-input-row { display: flex; gap: 0.75rem; }
        .chat-input-row input { flex: 1; min-width: 0; }
        .thumb-preview { position: relative; margin-bottom: 0.75rem; display: inline-block; }
        .thumb-preview img { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 2px solid var(--primary); }
        .hidden-file-input { display: none; }
        .compact-empty { padding: 2rem; text-align: center; }
      `}</style>
    </main>
  );
}

export default PlantDoctorPage;