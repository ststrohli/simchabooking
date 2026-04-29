
import React, { useState, useEffect, useRef } from 'react';
import { X, Send, User, Mail, MessageSquare, Bot, Image as ImageIcon, Paperclip, Mic, StopCircle, Play, Volume2, FileText, Download, Loader2, Shield } from 'lucide-react';
import { Vendor, Message, UserAccount } from '../types';
import { storage } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface ChatModalProps {
  isOpen: boolean;
  vendor: Vendor | null; // For vendor chat
  isAdminMode?: boolean; // For client-to-admin chat
  onClose: () => void;
  onSendMessage: (payload: Partial<Message>) => void;
  showNotification: (message: string, type?: 'success' | 'info') => void;
  messages: Message[];
  user: UserAccount;
}

const ChatModal: React.FC<ChatModalProps> = ({ isOpen, vendor, isAdminMode, onClose, onSendMessage, showNotification, messages, user }) => {
  const [text, setText] = useState('');
  const [clientName, setClientName] = useState(user?.name || '');
  const [clientEmail, setClientEmail] = useState(user?.username || '');
  const [isIdentityVerified, setIsIdentityVerified] = useState(!!(user?.name && user?.username));
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (user?.name && user?.username) {
      setClientName(user.name);
      setClientEmail(user.username);
      setIsIdentityVerified(true);
    }
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim()) return;
    
    if (!isIdentityVerified) {
      if (clientName && clientEmail) {
        setIsIdentityVerified(true);
      } else {
        return;
      }
    }

    onSendMessage({
      text,
      clientName,
      clientEmail,
      receiverId: isAdminMode ? 'admin' : (vendor?.id || ''),
      isAdminInquiry: isAdminMode,
      type: 'text'
    });
    setText('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const storagePath = `chats/${Date.now()}_${file.name}`;
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', storagePath);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(await response.text());
      const { url } = await response.json();

      const isImage = file.type.startsWith('image/');

      onSendMessage({
        text: isImage ? 'Sent an image' : `Sent a file: ${file.name}`,
        clientName,
        clientEmail,
        receiverId: isAdminMode ? 'admin' : (vendor?.id || ''),
        isAdminInquiry: isAdminMode,
        type: isImage ? 'image' : 'file',
        fileUrl: url,
        fileName: file.name,
        fileType: file.type
      });
    } catch (err: any) {
      console.error("Upload failed:", err);
      showNotification("Upload failed: " + err.message, "info");
    } finally {
      setIsUploading(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showNotification("Your browser does not support audio recording or you are in an insecure context.", "info");
      return;
    }

    try {
      if (!window.isSecureContext) {
        showNotification("Audio recording requires a secure (HTTPS) connection.", "info");
        return;
      }
      
      // Some browsers require explicit user gesture for first permission request
      // which we have here (button click).
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
        const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setIsUploading(true);
        try {
          const fileExt = mimeType.split('/')[1].split(';')[0];
          const storagePath = `chats/voice_${Date.now()}.${fileExt}`;
          
          const formData = new FormData();
          formData.append('file', audioBlob);
          formData.append('path', storagePath);

          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) throw new Error(await response.text());
          const { url } = await response.json();

          onSendMessage({
            text: 'Voice note',
            clientName,
            clientEmail,
            receiverId: isAdminMode ? 'admin' : (vendor?.id || ''),
            isAdminInquiry: isAdminMode,
            type: 'voice',
            fileUrl: url
          });
        } catch (err: any) {
          console.error("Voice upload failed:", err);
          showNotification("Failed to upload voice message: " + err.message, "info");
        } finally {
          setIsUploading(false);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Microphone access denied detail:", err);
      
      let errorMessage = "Microphone access denied. Try opening the app in a new tab if you're in the preview.";
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('denied')) {
        errorMessage = "Microphone permission was denied. Please allow microphone access in your browser settings and try again.";
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage = "No microphone found on your device.";
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage = "Your microphone is already in use by another application.";
      }
      
      showNotification(errorMessage, "info");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const formatDuration = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const chatMessages = messages.filter(m => {
    if (isAdminMode) return m.isAdminInquiry && m.clientEmail === clientEmail;
    return !m.isAdminInquiry && m.clientEmail === clientEmail && (m.receiverId === vendor?.id || m.senderId === vendor?.id);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0a0a0a] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-[#D4AF37]/20 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-black p-4 border-b border-[#D4AF37]/20 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {isAdminMode ? (
              <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 flex items-center justify-center border border-[#D4AF37]/30">
                <Shield className="w-5 h-5 text-[#D4AF37]" />
              </div>
            ) : (
              <img src={vendor?.image} className="w-10 h-10 rounded-full object-cover border border-[#D4AF37]/30" alt="" />
            )}
            <div>
              <h3 className="font-bold text-[#D4AF37] font-[Cinzel] text-sm">{isAdminMode ? 'System Concierge' : vendor?.name}</h3>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">{isAdminMode ? 'Direct Support' : 'In-App Messaging'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-2 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Identity Verification */}
        {!isIdentityVerified ? (
          <div className="p-6 space-y-4">
            <div className="text-center mb-4">
              <User className="w-10 h-10 text-[#D4AF37] mx-auto mb-2 opacity-50" />
              <h4 className="text-white font-bold">Who are you?</h4>
              <p className="text-xs text-slate-500">Provide your details to start a conversation.</p>
            </div>
            <div className="space-y-3">
              <input 
                type="text" 
                placeholder="Your Name" 
                className="w-full bg-[#111] border border-[#D4AF37]/20 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-[#D4AF37]" 
                value={clientName} 
                onChange={e => setClientName(e.target.value)} 
              />
              <input 
                type="email" 
                placeholder="Your Email" 
                className="w-full bg-[#111] border border-[#D4AF37]/20 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-[#D4AF37]" 
                value={clientEmail} 
                onChange={e => setClientEmail(e.target.value)} 
              />
              <button 
                onClick={() => clientName && clientEmail && setIsIdentityVerified(true)}
                className="w-full bg-[#D4AF37] text-black font-bold py-2.5 rounded-lg hover:bg-[#E5C76B] transition-all text-sm uppercase tracking-widest"
              >
                Start Chatting
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Body */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/40">
              {chatMessages.length === 0 ? (
                <div className="text-center py-10 opacity-30">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 text-[#D4AF37]" />
                  <p className="text-xs font-[Cinzel]">{isAdminMode ? 'Have a question? We are here to help.' : 'Send a message to inquire about services.'}</p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.senderId === 'client' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-lg ${
                      msg.senderId === 'client' 
                        ? 'bg-[#D4AF37] text-black rounded-tr-none' 
                        : 'bg-[#1a1a1a] text-slate-200 border border-[#D4AF37]/10 rounded-tl-none'
                    }`}>
                      {msg.type === 'image' ? (
                        <div className="space-y-2">
                           <img src={msg.fileUrl} className="rounded-lg w-full max-h-60 object-cover border border-black/10" alt="Sent" />
                           {msg.text && msg.text !== 'Sent an image' && <p>{msg.text}</p>}
                        </div>
                      ) : msg.type === 'file' ? (
                        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-black/10 p-2 rounded-lg hover:bg-black/20 transition-all">
                          <FileText className="w-8 h-8 opacity-50" />
                          <div className="flex-1 min-w-0">
                             <p className="truncate font-bold text-xs">{msg.fileName}</p>
                             <p className="text-[10px] opacity-50">Click to download</p>
                          </div>
                          <Download className="w-4 h-4 opacity-50" />
                        </a>
                      ) : msg.type === 'voice' ? (
                        <div className="flex items-center gap-3 min-w-[120px]">
                           <div className="p-2 bg-black/10 rounded-full cursor-pointer hover:bg-black/20">
                             <Play className="w-4 h-4" />
                           </div>
                           <div className="flex-1 h-1 bg-black/20 rounded-full overflow-hidden">
                              <div className="w-1/2 h-full bg-current opacity-30"></div>
                           </div>
                           <Volume2 className="w-4 h-4 opacity-50" />
                        </div>
                      ) : (
                        <p>{msg.text}</p>
                      )}
                      
                      <span className={`text-[8px] block mt-1.5 opacity-50 font-medium ${msg.senderId === 'client' ? 'text-black' : 'text-slate-500'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input Footer */}
            <div className="p-4 border-t border-[#D4AF37]/20 bg-black space-y-3">
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
              
              <div className="flex items-center gap-2">
                {!isRecording ? (
                  <>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 text-slate-500 hover:text-[#D4AF37] transition-all"
                      title="Attach file"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <div className="relative flex-1 flex items-center">
                      <input 
                        type="text" 
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Type a message..."
                        className="w-full bg-[#111] border border-[#D4AF37]/20 rounded-xl pl-4 pr-10 py-2.5 text-sm text-white focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all"
                      />
                    </div>
                    {text.trim() ? (
                      <button 
                        onClick={() => handleSend()}
                        className="p-2.5 bg-[#D4AF37] text-black rounded-xl hover:bg-[#E5C76B] transition-all shadow-lg shadow-[#D4AF37]/10"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    ) : (
                      <button 
                         onClick={startRecording}
                         className="p-2.5 bg-slate-800 text-[#D4AF37] rounded-xl hover:bg-slate-700 transition-all"
                      >
                         <Mic className="w-5 h-5" />
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 animate-pulse">
                    <div className="flex items-center gap-3">
                       <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                       <span className="text-red-500 text-xs font-bold font-mono">{formatDuration(recordingDuration)}</span>
                    </div>
                    <button 
                      onClick={stopRecording}
                      className="bg-red-500 text-white p-2 rounded-lg hover:bg-red-600 transition-all"
                    >
                      <StopCircle className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {isUploading && (
                <div className="flex items-center justify-center gap-2 text-[10px] text-[#D4AF37] font-black uppercase tracking-widest animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" /> Uploading Media...
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ChatModal;
