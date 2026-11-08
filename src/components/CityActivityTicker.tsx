/**
 * CityActivityTicker — bottom bar: live "city pulse" of notifications plus the
 * citizen switcher row (fast way to open any citizen, children included).
 */
import React, { useState } from 'react';
import { AgentData } from '../types/simulation';
import { ActivityNotification } from '../simulation/simulationEngine';
import { soundEngine } from '../audio/soundEngine';
import { ChevronUp, ChevronDown, Radio, Sparkles } from 'lucide-react';

interface CityActivityTickerProps {
  agents: AgentData[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  notifications: ActivityNotification[];
}

export const CityActivityTicker: React.FC<CityActivityTickerProps> = ({
  agents,
  selectedAgentId,
  onSelectAgent,
  notifications
}) => {
  const [isFeedExpanded, setIsFeedExpanded] = useState(false);

  const latestNotif = notifications[0];

  return (
    <footer className="bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/90 text-slate-200 select-none z-20 shrink-0 flex flex-col">
      {/* 1. macOS Style Citizen Avatar Dock */}
      <div className="flex items-center gap-2 px-4 py-1.5 overflow-x-auto scrollbar-none">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 px-1 hidden md:inline">
          Citizens:
        </span>

        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          {agents.map(agent => {
            const isSelected = selectedAgentId === agent.id;
            return (
              <button
                key={agent.id}
                onClick={() => {
                  soundEngine.playClickSound();
                  onSelectAgent(agent.id);
                }}
                className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs whitespace-nowrap transition-all duration-150 transform hover:scale-105 active:scale-95 shrink-0 ${
                  isSelected
                    ? 'bg-slate-800 border-amber-400 text-white shadow-md shadow-amber-500/10 ring-1 ring-amber-400/60'
                    : 'bg-slate-950/70 border-slate-800/90 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-700'
                }`}
                title={`${agent.name} (${agent.profession}, ${agent.personality}) · ${agent.currentThought}`}
              >
                {/* Avatar Icon */}
                <span 
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] shadow-sm shrink-0 border border-white/20"
                  style={{ backgroundColor: agent.color }}
                >
                  {agent.avatarEmoji}
                </span>

                {/* Name */}
                <span className="font-semibold text-xs leading-none">
                  {agent.name.split(' ')[0]}
                </span>

                {/* Thought Emote */}
                <span className="text-[11px] opacity-80 group-hover:opacity-100 transition-opacity">
                  {agent.thoughtEmoji}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Compact Single-Line Live City Pulse Ticker */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950/90 border-t border-slate-800/60 text-xs text-slate-300 gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-[11px] uppercase tracking-wider shrink-0">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>City Pulse:</span>
          </div>

          {latestNotif ? (
            <div className="flex items-center gap-2 truncate text-slate-200 text-xs">
              <span className="font-mono text-slate-400 text-[11px] tabular-nums shrink-0">
                [{latestNotif.timeString}]
              </span>
              <span className="truncate">
                {latestNotif.icon} {latestNotif.message}
              </span>
            </div>
          ) : (
            <span className="text-slate-500 italic text-xs">
              Listening to city activities...
            </span>
          )}
        </div>

        {/* Collapsible Feed Log Button */}
        <button
          onClick={() => setIsFeedExpanded(!isFeedExpanded)}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
        >
          <span>Feed ({notifications.length})</span>
          {isFeedExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>
      </div>

      {/* 3. Expanded Activity Feed Log Modal/Drawer */}
      {isFeedExpanded && (
        <div className="max-h-40 overflow-y-auto px-4 py-2.5 border-t border-slate-800 bg-slate-950/95 space-y-1.5 select-text">
          {notifications.map(n => (
            <div key={n.id} className="flex items-start gap-2 text-xs text-slate-300">
              <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0 pt-0.5">
                {n.timeString}
              </span>
              <span className="shrink-0">{n.icon}</span>
              <span className="leading-snug">{n.message}</span>
            </div>
          ))}
        </div>
      )}
    </footer>
  );
};

