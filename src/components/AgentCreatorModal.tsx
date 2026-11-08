/**
 * AgentCreatorModal — God-mode "New Citizen" form; spawns through
 * SimulationEngine.spawnCustomAgent (which fills all human-life defaults).
 */
import React, { useState } from 'react';
import { X, Sparkles, UserCheck } from 'lucide-react';
import { PersonalityTrait } from '../types/simulation';
import { soundEngine } from '../audio/soundEngine';

interface AgentCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSpawn: (agentData: {
    name: string;
    profession: string;
    personality: PersonalityTrait;
    color: string;
    avatarEmoji: string;
  }) => void;
}

export const AgentCreatorModal: React.FC<AgentCreatorModalProps> = ({
  isOpen,
  onClose,
  onSpawn
}) => {
  const [name, setName] = useState('');
  const [profession, setProfession] = useState('Game Developer');
  const [personality, setPersonality] = useState<PersonalityTrait>('Creative');
  const [color, setColor] = useState('#8B5CF6');
  const [avatarEmoji, setAvatarEmoji] = useState('🎮');

  if (!isOpen) return null;

  const personalities: PersonalityTrait[] = [
    'Creative', 
    'Ambitious', 
    'Introvert', 
    'Extrovert', 
    'Empathetic', 
    'Analytical', 
    'Chill'
  ];

  const presetEmojis = ['🎮', '🎨', '🚀', '🔬', '🕵️', '📚', '🍕', '🚲', '🎸', '🌱'];
  const presetColors = ['#3B82F6', '#EC4899', '#F59E0B', '#10B981', '#8B5CF6', '#F97316', '#06B6D4', '#EF4444'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || 'Citizen Nova';
    onSpawn({
      name: finalName,
      profession: profession.trim() || 'Urban Explorer',
      personality,
      color,
      avatarEmoji
    });
    setName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-400/20 text-amber-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Create New Citizen</h2>
              <p className="text-xs text-slate-400">Spawn an autonomous cognitive AI agent into town</p>
            </div>
          </div>
          <button
            onClick={() => {
              soundEngine.playClickSound();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Citizen Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Kai Sterling"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Profession */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Profession / Role</label>
            <input
              type="text"
              required
              value={profession}
              onChange={e => setProfession(e.target.value)}
              placeholder="e.g. Indie Game Dev, Botanist, Detective"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Personality Trait */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Personality Archetype</label>
            <div className="grid grid-cols-3 gap-1.5">
              {personalities.map(p => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPersonality(p)}
                  className={`py-1.5 px-2 text-xs rounded-lg border text-center transition-all ${
                    personality === p
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300 font-bold'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Avatar Icon */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Avatar Emoji</label>
            <div className="flex items-center gap-2 flex-wrap">
              {presetEmojis.map(emoji => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => setAvatarEmoji(emoji)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg border transition-all ${
                    avatarEmoji === emoji
                      ? 'bg-amber-400/30 border-amber-400 scale-110'
                      : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Signature Color */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Theme Color</label>
            <div className="flex items-center gap-2">
              {presetColors.map(c => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                    color === c ? 'scale-125 border-white shadow-md' : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
            >
              <UserCheck className="w-4 h-4" />
              <span>Spawn Citizen into Town</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
