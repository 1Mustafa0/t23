/**
 * ============================================================================
 *  GAZETTE ANALYZER — the city newspaper's data journalist
 * ============================================================================
 *
 *  Reads LIVE simulation state (agents, notifications, memories, urban
 *  metrics) and assembles a daily GazetteEdition with several stories — most
 *  sociable citizen, economy health, city Pulse quotes, public-services
 *  report, and a moral compass piece driven by real social memory entries.
 *  Fully bilingual (Arabic default). When Gemini is configured, the server
 *  re-writes these stories into prose; this module remains the fallback AND
 *  the data source either way (source: 'local' | 'gemini').
 */
import { AgentData, SimulationTime, MemoryEntry } from '../types/simulation';
import { CITY_LOCATIONS } from './cityMap';
import { ActivityNotification } from './simulationEngine';

export interface GazetteStory {
  id: string;
  category: 'social' | 'economy' | 'health' | 'civic';
  badge: string;
  headline: string;
  subheadline: string;
  body: string;
  highlightStat: string;
  citizenName: string;
  citizenEmoji: string;
  citizenColor: string;
  timestamp: string;
}

export interface GazetteEdition {
  editionNumber: number;
  day: number;
  dateString: string;
  headlineOfTheDay: string;
  weatherSummary: string;
  stories: GazetteStory[]; // Top 3 most significant events
  quickStats: {
    totalConversations: number;
    moneyCirculated: number;
    clinicVisits: number;
  };
  source?: 'local' | 'gemini';
  language?: 'ar' | 'en';
}

type GazetteLanguage = 'ar' | 'en';

function firstName(name: string): string {
  return name.split(' ')[0];
}

function extractQuote(value: string): string | undefined {
  const match = value.match(/"([^"]+)"/);
  return match?.[1];
}

function cleanNotification(message: string, max = 110): string {
  return message.replace(/^[\p{Extended_Pictographic}\s]+/u, '').trim().slice(0, max);
}

export function generateGazette(
  agents: AgentData[],
  time: SimulationTime,
  notifications: ActivityNotification[],
  language: GazetteLanguage = 'ar'
): GazetteEdition {
  const isAr = language === 'ar';
  const safeAgents = agents.length > 0 ? agents : [];

  // Strict rolling window: the last 24 simulated hours (1440 minutes). Every
  // memory entry and notice carries an absolute sim-minute stamp, so this is a
  // real query instead of "whatever happened to survive the 40-item cap".
  // Legacy entries without a stamp are treated as inside the window.
  const windowStart = time.totalMinutes - 24 * 60;
  const inWindow = (stamp?: number) => typeof stamp !== 'number' || stamp >= windowStart;

  // 1. Social Activity Analysis (real 'social' memories + social notifications)
  const socialCounts: Record<string, { count: number; agent: AgentData; latestQuote?: string }> = {};
  safeAgents.forEach(agent => {
    socialCounts[agent.id] = { count: 0, agent };
    agent.memoryStream.forEach(mem => {
      if (mem.category === 'social' && inWindow(mem.simMinute)) {
        socialCounts[agent.id].count += 1;
        const quote = extractQuote(mem.text);
        if (quote && !socialCounts[agent.id].latestQuote) {
          socialCounts[agent.id].latestQuote = quote;
        }
      }
    });
  });

  // Fallback signal from the activity ticker, so the gazette is never static
  // even before the first face-to-face conversation happens.
  notifications
    .filter(n => n.type === 'social' && inWindow(n.totalMinutes))
    .slice(0, 20)
    .forEach(n => {
      const quoted = extractQuote(n.message);
      const matched = safeAgents.find(a => n.message.includes(firstName(a.name)) || n.message.includes(a.name));
      if (!matched) return;
      socialCounts[matched.id].count += 1;
      if (quoted && !socialCounts[matched.id].latestQuote) {
        socialCounts[matched.id].latestQuote = quoted;
      }
    });

  const sortedSocial = Object.values(socialCounts).sort((a, b) => b.count - a.count);
  const topSocialite = sortedSocial[0] || { count: 0, agent: safeAgents[0] };

  // 2. Economic Activity Analysis
  const economicTitan = [...safeAgents].sort((a, b) => b.stats.money - a.stats.money)[0] || safeAgents[0];

  // 3. Healthcare & Safety Analysis
  const hospitalMemories: { agent: AgentData; mem: MemoryEntry }[] = [];
  safeAgents.forEach(agent => {
    agent.memoryStream.forEach(mem => {
      if (!inWindow(mem.simMinute)) return;
      const lower = mem.text.toLowerCase();
      if (lower.includes('hospital') || lower.includes('clinic') || lower.includes('healing') || lower.includes('exhausted') || lower.includes('health')) {
        hospitalMemories.push({ agent, mem });
      }
    });
  });
  const hospitalPatient = hospitalMemories.length > 0
    ? hospitalMemories[0].agent
    : [...safeAgents].sort((a, b) => a.stats.mood - b.stats.mood)[0] || safeAgents[0];

  // Real clinic footfall: the hospital's own daily counter (reset at midnight),
  // far more truthful than grepping memories for the word "rest".
  const hospitalLocation = CITY_LOCATIONS.find(location => location.id === 'hospital');
  const clinicVisits = hospitalLocation?.customersToday ?? hospitalMemories.length;

  // 4. Pick the most recent civic/work notice from the live ticker.
  const civicNotice = notifications.find(
    n => (n.type === 'work' || n.type === 'event' || n.type === 'godmode') && inWindow(n.totalMinutes),
  );

  const topSocialiteName = topSocialite?.agent?.name || 'AgentVille';
  const economicName = economicTitan?.name || topSocialiteName;
  const patientName = hospitalPatient?.name || topSocialiteName;
  const conversations = Math.max(0, topSocialite?.count || 0);
  const money = Math.round(safeAgents.reduce((acc, a) => acc + a.stats.money, 0));

  const socialQuote = topSocialite?.latestQuote
    ? `"${topSocialite.latestQuote}"`
    : (isAr
      ? '"التواصل المجتمعي هو نبض هذه المدينة الحيّة!"'
      : '"Community connection is the true lifeblood of AgentVille!"');

  const story1: GazetteStory = {
    id: 'story_social',
    category: 'social',
    badge: isAr ? 'أضواء اجتماعية' : 'Social Spotlight',
    headline: isAr
      ? `${firstName(topSocialiteName)} يتصدّر مشهد الحياة الاجتماعية`
      : `${firstName(topSocialiteName)} Crowned Most Sociable Citizen`,
    subheadline: isAr
      ? `سجّل ${conversations} محادثة حيّة في مراكز المدينة خلال آخر 24 ساعة.`
      : `Recorded ${conversations} lively conversations across town hubs in the last 24 hours.`,
    body: isAr
      ? `كان المقهى والحديقة المركزية نابضين بالحياة اليوم، حيث التقى ${topSocialiteName} بمواطنين من مختلف القطاعات. وعند سؤاله عن سرّ هذه الطاقة، قال: ${socialQuote}`
      : `Cozy Cafe and Central Park were abuzz today as ${topSocialiteName} connected with fellow citizens across all sectors. When asked for comment, they noted: ${socialQuote}`,
    highlightStat: isAr ? `${conversations} محادثة` : `${conversations} Dialogues Logged`,
    citizenName: topSocialiteName,
    citizenEmoji: topSocialite?.agent?.avatarEmoji || '💬',
    citizenColor: topSocialite?.agent?.color || '#3B82F6',
    timestamp: time.timeString,
  };

  const story2: GazetteStory = {
    id: 'story_economy',
    category: 'economy',
    badge: isAr ? 'اقتصاد وأسواق' : 'Commerce & Wealth',
    headline: isAr
      ? `${firstName(economicName)} يقود حركة اقتصادية نشطة`
      : `${firstName(economicName)} Leads Municipal Commerce Boom`,
    subheadline: isAr
      ? `رصيده يبلغ $${Math.round(economicTitan?.stats.money || 0)} وسط نشاط تجاري وخدمي متصاعد.`
      : `Vault balance reaches $${Math.round(economicTitan?.stats.money || 0)} amidst high market and tech activity.`,
    body: isAr
      ? `سجّل القطاع الاقتصادي حركة معاملات قوية بين ورش العمل والأسواق المحلية. وبرز ${economicName} (${economicTitan?.profession || ''}) كأبرز فاعل اقتصادي في الدورة الأخيرة، بينما بلغ إجمالي الأرصدة النقدية بحوزة المواطنين $${money}.`
      : `The economic sector reported strong transactional velocity between tech sprints and local market trades. ${economicName} (${economicTitan?.profession || ''}) emerged as the premier economic force, while total cash held by citizens reached $${money}.`,
    highlightStat: isAr
      ? `$${Math.round(economicTitan?.stats.money || 0)} صافي الثروة`
      : `$${Math.round(economicTitan?.stats.money || 0)} Net Worth`,
    citizenName: economicName,
    citizenEmoji: economicTitan?.avatarEmoji || '💰',
    citizenColor: economicTitan?.color || '#10B981',
    timestamp: isAr ? 'آخر 24 ساعة' : 'Past 24 Hours',
  };

  const story3: GazetteStory = civicNotice
    ? {
        id: 'story_civic',
        category: 'civic',
        badge: isAr ? 'مكتب المدينة' : 'Civic Desk',
        headline: cleanNotification(civicNotice.message),
        subheadline: isAr
          ? 'آخر مستجدات البلدية والخدمات العامة في المدينة.'
          : 'The latest municipal and public-service development.',
        body: isAr
          ? `${civicNotice.message} في الشأن الصحي، يبقى ${patientName} تحت متابعة فريق الرعاية مع مؤشر مزاج يبلغ ${Math.round(hospitalPatient?.stats.mood || 0)}%.`
          : `${civicNotice.message} On the wellness front, ${patientName} remains under the care team's watch with a mood index of ${Math.round(hospitalPatient?.stats.mood || 0)}%.`,
        highlightStat: isAr ? `${Math.round(hospitalPatient?.stats.mood || 0)}% مؤشر المزاج` : `${Math.round(hospitalPatient?.stats.mood || 0)}% Mood Index`,
        citizenName: patientName,
        citizenEmoji: hospitalPatient?.avatarEmoji || civicNotice.icon || '🏛️',
        citizenColor: hospitalPatient?.color || '#6366F1',
        timestamp: civicNotice.timeString,
      }
    : {
        id: 'story_health',
        category: 'health',
        badge: isAr ? 'صحة وسلامة' : 'Wellness & Safety',
        headline: isAr
          ? 'المستشفى البلدي يسجّل معدلات تعافٍ مرتفعة'
          : 'City Hospital Reports Peak Recovery Rates',
        subheadline: isAr
          ? 'زيارات الرعاية الاستباقية تحافظ على مؤشرات صحة المدينة.'
          : 'Proactive clinic visits keep town wellness metrics healthy.',
        body: isAr
          ? `قدّم فريق المستشفى البلدي فحوصات طبية وعلاجاً استشفائياً في الوقت المناسب. وأُشيد بـ${patientName} لاهتمامه بروتين العافية والحفاظ على مؤشرات حيوية مستقرة.`
          : `City Hospital and emergency staff provided timely medical checks and restorative therapy. ${patientName} was commended for prioritizing wellness routines and stable vital signs.`,
        highlightStat: isAr ? `${Math.round(hospitalPatient?.stats.mood || 0)}% المزاج الحالي` : `${Math.round(hospitalPatient?.stats.mood || 0)}% Current Mood`,
        citizenName: patientName,
        citizenEmoji: hospitalPatient?.avatarEmoji || '🩺',
        citizenColor: hospitalPatient?.color || '#10B981',
        timestamp: isAr ? 'مكتب الصحة البلدي' : 'Municipal Health Desk',
      };

  return {
    editionNumber: time.day,
    day: time.day,
    dateString: isAr ? `اليوم ${time.day} · ${time.timeString}` : `Day ${time.day} · ${time.timeString}`,
    headlineOfTheDay: isAr
      ? `${firstName(topSocialiteName)} يشعل الحياة الاجتماعية و$${money} تدور في أسواق المدينة`
      : `${firstName(topSocialiteName)}'s Social Spark & $${money} Municipal Trade Surge`,
    weatherSummary: isAr
      ? `الأجواء: ${time.timeOfDay === 'night' ? 'ليل هادئ' : time.timeOfDay === 'sunset' ? 'غروب دافئ' : time.timeOfDay === 'dawn' ? 'فجر منعش' : 'نهار مشمس'} فوق أحياء المدينة الستة.`
      : `Atmosphere: ${time.timeOfDay.toUpperCase()} skies over all 6 districts.`,
    stories: [story1, story2, story3],
    quickStats: {
      totalConversations: Math.max(0, conversations),
      moneyCirculated: money,
      clinicVisits,
    },
    source: 'local',
    language,
  };
}
