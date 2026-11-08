/**
 * CityGazetteModal — the newspaper overlay. Shows the GazetteEdition produced
 * by the analyzer/local templates or upgraded by server-side Gemini
 * (source badge + loading spinner included).
 */
import React from 'react';
import { X, Newspaper, TrendingUp, Users, HeartPulse, Sparkles, MessageSquareQuote, Loader2 } from 'lucide-react';
import { GazetteEdition } from '../simulation/gazetteAnalyzer';
import { soundEngine } from '../audio/soundEngine';

interface CityGazetteModalProps {
  isOpen: boolean;
  onClose: () => void;
  gazette: GazetteEdition;
  isLoading?: boolean;
  aiProvider?: 'gemini' | 'local';
}

export const CityGazetteModal: React.FC<CityGazetteModalProps> = ({
  isOpen,
  onClose,
  gazette,
  isLoading = false,
  aiProvider = gazette.source === 'gemini' ? 'gemini' : 'local'
}) => {
  if (!isOpen) return null;

  const isAr = gazette.language === 'ar';
  const isGemini = aiProvider === 'gemini';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md select-text">
      {/* Newspaper Container */}
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-[#FDFBF7] text-slate-900 border border-amber-900/30 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150 font-serif">
        
        {/* Close Button (Top Right) */}
        <button
          onClick={() => {
            soundEngine.playClickSound();
            onClose();
          }}
          className="absolute top-5 right-5 p-2 text-slate-500 hover:text-slate-900 hover:bg-amber-100 rounded-full transition-colors z-10"
          title="Close Gazette"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Newspaper Masthead */}
        <div className="border-b-4 border-double border-slate-900 pb-4 text-center space-y-2">
          <div className="flex items-center justify-between text-[11px] font-sans font-semibold tracking-widest text-slate-600 uppercase border-b border-slate-400 pb-1.5">
            <span>Vol. {gazette.day} · No. {gazette.editionNumber}</span>
            <span className="hidden sm:inline">The Premier Autonomous Citizen Chronicle</span>
            <span className="font-mono">{gazette.dateString}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-950 uppercase font-serif py-1">
            The AgentVille Gazette
          </h1>

          <div className="flex items-center justify-between text-xs font-sans text-slate-700 pt-1 border-t border-slate-300">
            <span>Special 24-Hour Municipal Retrospective</span>
            <span className="italic font-serif">{gazette.weatherSummary}</span>
            <span>Edition Price: FREE</span>
          </div>

          {/* AI source & live-generation status */}
          <div className="flex items-center justify-center gap-2 pt-1 font-sans">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                isGemini
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-slate-100 text-slate-600 border-slate-300'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              {isGemini ? 'Gemini Live Edition' : 'Local Edition'}
            </span>
            {isLoading && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-300">
                <Loader2 className="w-3 h-3 animate-spin" />
                {isAr ? 'جارٍ توليد نسخة Gemini…' : 'Generating Gemini edition…'}
              </span>
            )}
          </div>
        </div>

        {/* Lead Headline Banner */}
        <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-sans font-bold text-amber-800 uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>Top Headline of the Day</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-950 leading-tight">
            {gazette.headlineOfTheDay}
          </h2>
          <p className="text-xs sm:text-sm font-sans text-slate-600 leading-relaxed">
            {isAr
              ? 'سجّل مواطنو المدينة الآليون إنجازات لافتة في المشاركة المدنية، وفترات العمل التعاوني، والانسجام المجتمعي خلال آخر 24 ساعة محاكاة.'
              : 'Autonomous citizens across all six municipal districts recorded notable milestones in civic participation, collaborative work sprints, and community camaraderie over the past 24 simulation hours.'}
          </p>
        </div>

        {/* The Top 3 Significant Stories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          {gazette.stories.map((story, index) => {
            const isSocial = story.category === 'social';
            const isEconomy = story.category === 'economy';

            return (
              <article 
                key={story.id} 
                className="flex flex-col justify-between border-t-2 border-slate-900 pt-3 space-y-3"
              >
                <div className="space-y-2">
                  {/* Category & Order Tag */}
                  <div className="flex items-center justify-between text-[11px] font-sans font-bold text-slate-500 uppercase tracking-wider">
                    <span>Story 0{index + 1} // {story.badge}</span>
                    <span className="font-mono">{story.timestamp}</span>
                  </div>

                  {/* Headline */}
                  <h3 className="text-lg font-bold text-slate-950 leading-snug hover:text-amber-900 transition-colors">
                    {story.headline}
                  </h3>

                  {/* Key Stat Callout */}
                  <div className="flex items-center gap-2 p-2 bg-slate-100 rounded-lg font-sans border border-slate-200/60">
                    <div 
                      className="w-7 h-7 rounded-full flex items-center justify-center text-sm shadow-sm"
                      style={{ backgroundColor: story.citizenColor }}
                    >
                      {story.citizenEmoji}
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate-500 font-semibold block">Key Indicator</span>
                      <span className="text-xs font-mono font-bold text-slate-900">{story.highlightStat}</span>
                    </div>
                  </div>

                  {/* Subheadline & Body Copy */}
                  <h4 className="text-xs font-sans font-semibold text-slate-700 italic">
                    {story.subheadline}
                  </h4>
                  <p className="text-xs font-sans text-slate-600 leading-relaxed">
                    {story.body}
                  </p>
                </div>

                {/* Footer Citizen Byline */}
                <div className="pt-3 border-t border-slate-200 font-sans text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Subject: <strong>{story.citizenName}</strong></span>
                  <span className="text-amber-800 font-medium">Verified Log</span>
                </div>
              </article>
            );
          })}
        </div>

        {/* Municipal Quick Stats Strip */}
        <div className="border-t-2 border-slate-900 pt-4 flex flex-wrap items-center justify-between gap-4 font-sans text-xs bg-slate-100/70 p-4 rounded-xl">
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-sky-600" />
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Active Conversations</span>
              <span className="font-mono font-bold text-slate-900 text-sm tabular-nums">
                {gazette.quickStats.totalConversations} Dialogues
              </span>
            </div>
          </div>

          <div className="w-px h-8 bg-slate-300 hidden sm:block" />

          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Money in Circulation</span>
              <span className="font-mono font-bold text-emerald-700 text-sm tabular-nums">
                ${gazette.quickStats.moneyCirculated}
              </span>
            </div>
          </div>

          <div className="w-px h-8 bg-slate-300 hidden sm:block" />

          <div className="flex items-center gap-2.5">
            <HeartPulse className="w-4 h-4 text-rose-600" />
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Hospital Wellness Interventions</span>
              <span className="font-mono font-bold text-slate-900 text-sm tabular-nums">
                {gazette.quickStats.clinicVisits} Visits
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              soundEngine.playClickSound();
              onClose();
            }}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg transition-colors ml-auto"
          >
            Return to City
          </button>
        </div>
      </div>
    </div>
  );
};
