/**
 * ============================================================================
 *  MIND VOICE — every citizen speaks from its own head
 * ============================================================================
 *
 *  Conversations are not picked from a shared template table anymore. Each
 *  line is assembled from THAT citizen's mind:
 *
 *      posture   how they feel right now (warm, weary, angry, proud, ashamed…)
 *      need      what is dominating their thoughts (money, food, rest, family…)
 *      values    honesty / compassion / family / ambition / dignity shape tone
 *      bond      stranger, friend, partner, spouse — changes what is allowed
 *      memory    a recent arrest, a birth, a kindness, a crime they witnessed
 *
 *  The speaker opens with an act that fits its posture, says something about
 *  the topic it actually cares about, then closes in its own mood. The listener
 *  replies from ITS posture — a compassionate citizen comforts, a selfish one
 *  dismisses, a partner flirts, a guarded one deflects. Two minds, two voices.
 */
import { AgentData, CityEvent } from '../types/simulation';
import { getRelationshipBetween } from './relationships';
import { ensurePsyche } from './psychology';

export type Posture =
  | 'warm'
  | 'guarded'
  | 'angry'
  | 'hopeful'
  | 'weary'
  | 'flirty'
  | 'proud'
  | 'ashamed'
  | 'scheming';

export type Topic = 'money' | 'food' | 'rest' | 'health' | 'social' | 'family' | 'city';

export type Act =
  | 'greet'
  | 'complain'
  | 'brag'
  | 'plan'
  | 'comfort'
  | 'confess'
  | 'threat'
  | 'flirt'
  | 'probe'
  | 'dismiss'
  | 'agree';

export interface VoiceContext {
  locationType: string;
  locationName: string;
  event: CityEvent | null;
  language: 'ar' | 'en';
  day: number;
}

export interface GeneratedExchange {
  textA: string;
  textB: string;
  actA: Act;
  actB: Act;
  postureA: Posture;
  postureB: Posture;
  topic: Topic;
}

// ---------------------------------------------------------------------------
// Reading a mind
// ---------------------------------------------------------------------------

export interface Mind {
  posture: Posture;
  topic: Topic;
  values: { honesty: number; compassion: number; family: number; ambition: number; dignity: number };
  stress: number;
  hope: number;
  bond: 'stranger' | 'friend' | 'dating' | 'engaged' | 'married';
}

function choosePosture(agent: AgentData, bond: Mind['bond']): Posture {
  const psyche = ensurePsyche(agent);
  const { mood, money } = agent.stats;

  if (agent.jailedUntil != null) return 'ashamed';
  if ((psyche.values?.ambition ?? 50) > 70 && money > 220 && mood > 60) return 'proud';
  if (bond === 'dating' || bond === 'engaged' || bond === 'married') return 'flirty';
  if ((psyche.stress > 50 && mood < 30) || (psyche.stress > 68 && psyche.impulse > 60)) return 'angry';
  if (psyche.resentment > 60) return 'scheming';
  if (psyche.hope < 28 || mood < 20) return 'weary';
  if (psyche.stress > 60) return 'guarded';
  if (mood > 72) return 'hopeful';
  if ((psyche.values?.compassion ?? 50) > 65) return 'warm';
  return 'guarded';
}

function chooseTopic(agent: AgentData, ctx: VoiceContext): Topic {
  const { money, hunger, energy, mood, social } = agent.stats;
  if (money < 45) return 'money';
  if (hunger < 40) return 'food';
  if (energy < 38) return 'rest';
  if (mood < 38) return 'health';
  if ((agent.childIds?.length ?? 0) > 0 && Math.random() < 0.4) return 'family';
  if (social < 45) return 'social';
  if (ctx.event) return 'city';
  return mood < 55 ? 'health' : 'city';
}

function bondOf(agent: AgentData, other: AgentData): Mind['bond'] {
  const relation = getRelationshipBetween(agent, other);
  if (!relation) return 'stranger';
  if (relation.stage === 'married') return 'married';
  if (relation.stage === 'engaged') return 'engaged';
  if (relation.stage === 'dating') return 'dating';
  if (relation.stage === 'friend' || relation.stage === 'acquaintance') return 'friend';
  return 'stranger';
}

export function readMind(agent: AgentData, other: AgentData, ctx: VoiceContext): Mind {
  const psyche = ensurePsyche(agent);
  return {
    posture: choosePosture(agent, bondOf(agent, other)),
    topic: chooseTopic(agent, ctx),
    values: psyche.values ?? { honesty: 50, compassion: 50, family: 50, ambition: 50, dignity: 50 },
    stress: psyche.stress,
    hope: psyche.hope,
    bond: bondOf(agent, other),
  };
}

// ---------------------------------------------------------------------------
// Phrase banks (Arabic + English). Slots: {name} {place} {n} {amount}
// ---------------------------------------------------------------------------

type Bank = Record<string, { ar: string[]; en: string[] }>;

const OPENERS: Bank = {
  greet: {
    ar: ['يا {name}، إزي حالك؟', 'أهلاً {name}، من زمان ماشوفتكش.', '{name}! أخبارك إيه؟'],
    en: ['Hey {name}, how are you holding up?', '{name}! Long time no see.', 'Good to see you, {name}.'],
  },
  complain: {
    ar: ['بصراحة يا {name}، الدنيا بقت صعبة.', 'مش عارف يا {name}، تعبت من اللف والدوران.', '{name}، أنا خلاص مش قادر.'],
    en: ['Honestly {name}, things are getting hard.', "I don't know, {name}, I'm running on empty.", "{name}, I'm at my limit."],
  },
  brag: {
    ar: ['شفت يا {name}؟', 'الحمد لله يا {name}، الدنيا ماشية.', '{name}، لازم أحكيلك حاجة حلوة.'],
    en: ['You see, {name}?', 'Things are finally moving, {name}.', 'I have to tell you, {name}.'],
  },
  plan: {
    ar: ['بفكر يا {name}…', 'عندي خطة يا {name}.', 'نفسي يا {name} أغيّر حاجة في حياتي.'],
    en: ["I've been thinking, {name}…", 'I have a plan, {name}.', 'I want something to change, {name}.'],
  },
  comfort: {
    ar: ['ماتقلقش يا {name}.', 'أنا معاك يا {name}, لو محتاج حاجة.', '{name}، كل حاجة هتتحل بإذن الله.'],
    en: ["Don't carry it alone, {name}.", "I'm here, {name}, if you need anything.", "It will work out, {name}."],
  },
  confess: {
    ar: ['ندمان يا {name}.', 'مش عارف أحكي لحد غيرك يا {name}.', '{name}، عملت حاجة مش فخور بيها.'],
    en: ["I regret it, {name}.", "I can't tell anyone but you, {name}.", "{name}, I did something I'm not proud of."],
  },
  threat: {
    ar: ['بلاش تجربني يا {name}.', 'خد بالك من كلامك يا {name}.', '{name}، أنا مش في مزاجي.'],
    en: ["Don't test me, {name}.", 'Watch your words, {name}.', "{name}, I'm not in the mood."],
  },
  flirt: {
    ar: ['وحشتني يا {name}.', '{name}، أنت أحلى حاجة في يومي.', 'تعالى هنا يا {name}، عندي كلام ليك.'],
    en: ['I missed you, {name}.', "You're the best part of my day, {name}.", 'Come here, {name}, I have something to say.'],
  },
  probe: {
    ar: ['إنت شغال في إيه الفترة دي يا {name}؟', 'الدنيا ماشية معاك يا {name}؟', '{name}، إيه أخبار الفلوس معاك؟'],
    en: ['What are you working on these days, {name}?', 'How is business, {name}?', '{name}, how are you fixed for money?'],
  },
  dismiss: {
    ar: ['مش فاضي لدموع يا {name}.', 'كل واحد عنده مشاكله يا {name}.', '{name}، متضحكش عليّ.'],
    en: ["I don't have time for tears, {name}.", 'Everyone has problems, {name}.', "Save it, {name}."],
  },
  agree: {
    ar: ['والله معاك حق يا {name}.', 'أنا حسّيت نفس الإحساس يا {name}.', '{name}، كلامك صح.'],
    en: ["You're right, {name}.", "I've felt the same, {name}.", "That's exactly it, {name}."],
  },
};

const BODIES: Bank = {
  money: {
    ar: ['الأسعار طلعت والمرتب زي ما هو، ومعايا {amount} بس.', 'مش عارف أغطي الشهر بفلوس قليلة كده.', 'الفلوس بتخلص قبل نص الشهر.'],
    en: ['Prices went up and my wage did not — I have {amount} left.', "I can't make the month stretch.", 'Money runs out before the middle of the month.'],
  },
  food: {
    ar: ['الجوع بيكسر الظهر، ومعدتي فاضية من الصبح.', 'من الصبح مأكلتش حاجة والمخبز بعيد.', 'لقمة العيش بقت مشكلة.'],
    en: ['Hunger wears you down; my stomach is empty since morning.', "I haven't eaten all day and the bakery is far.", 'Even bread is a problem now.'],
  },
  rest: {
    ar: ['مانمتش كويس من يومين، والشغل سحب كل طاقتي.', 'محتاج يوم أجازة بس أنام فيه.', 'جسمي تعبان ومحدش شايف.'],
    en: ["I haven't slept properly in two days.", 'One day off — just to sleep.', "My body is done and nobody sees it."],
  },
  health: {
    ar: ['رحت المستشفى الأسبوع ده ودفعت {amount}.', 'صحتي بدأت تتعب والعلاج غالي.', 'مزاجي وحش ومش عارف السبب.'],
    en: ['I was at the hospital this week and paid {amount}.', 'My health is slipping and care is expensive.', "My mood is low and I can't explain it."],
  },
  social: {
    ar: ['الوحدة صعبة، ومحتاج حد أتكلم معاه بجد.', 'قعدت أيام من غير ما أتكلم مع حد.', 'مش لاقي حد يسمعني.'],
    en: ['Loneliness is heavy; I need someone to really talk to.', "I've spent days without a real conversation.", "I can't find anyone who listens."],
  },
  family: {
    ar: ['الولاد كبروا بسرعة، والبيت بقى مسؤولية كبيرة.', 'شريكي تعبان ومحتاج مساعدة في البيت.', 'بحلم بمستقبل أحسن لأولادي.'],
    en: ['The kids are growing fast and the house is a lot to carry.', 'My partner is exhausted and needs help at home.', 'I dream of a better future for my children.'],
  },
  city: {
    ar: ['الضرايب بتزيد والخدمات زي ما هي.', 'الطرق بقت زحمة والمدينة مش زي زمان.', 'ساعات بحس إن البلد دي مش بتسمعنا.'],
    en: ['Taxes keep rising and services stay the same.', 'The streets are crowded; this city is not what it was.', 'Sometimes I feel this city does not hear us.'],
  },
};

const CLOSERS: Record<Posture, { ar: string[]; en: string[] }> = {
  warm: { ar: ['خد بالك من نفسك.', 'لو احتجت حاجة أنا موجود.', 'يلا نتمشى شوية.'], en: ['Take care of yourself.', "I'm around if you need me.", "Let's walk a bit."] },
  guarded: { ar: ['بس خلينا ساكتين أحسن.', 'مش عايز أتكلم كتير.', 'الحياة ماشية.'], en: ["Better not say more.", "I'd rather not get into it.", 'Life goes on.'] },
  angry: { ar: ['مش هسكت على كده.', 'حد لازم يتحاسب.', 'سيبني في حالي.'], en: ["I won't stay quiet.", 'Someone has to answer for this.', 'Leave me be.'] },
  hopeful: { ar: ['بس بكرة أحسن.', 'لسه فيه أمل.', 'هحاول تاني.'], en: ['Tomorrow can be better.', 'There is still hope.', "I'll try again."] },
  weary: { ar: ['خلاص، مفيش فايدة.', 'ربنا يستر.', 'أنا رايح أنام.'], en: ['What is the point.', 'God help us.', "I'm going to sleep."] },
  flirty: { ar: ['تعالى نقعد مع بعض.', 'أنت بتفهمني.', 'بحب كلامك.'], en: ["Let's sit together.", 'You understand me.', 'I like talking to you.'] },
  proud: { ar: ['الحمد لله.', 'ده كله بفضل شغلي.', 'أنا مبسوط.'], en: ['Thank God.', 'That is all from hard work.', "I'm pleased."] },
  ashamed: { ar: ['مش عايز أحكي أكتر.', 'سامحني.', 'أنا محتاج أصلّح حاجات كتير.'], en: ["I don't want to say more.", 'Forgive me.', 'I have a lot to fix.'] },
  scheming: { ar: ['بس أنا عارف ألعبها إزاي.', 'الدنيا بتاخد وتدي.', 'خلينا نشوف.'], en: ['I know how to play this.', 'The world takes and gives.', "Let's see."] },
};

/**
 * Reply bodies: the listener answers the ACT it just heard, so a comfort line
 * actually comforts instead of switching to the listener's own complaint.
 */
const REPLY_BODIES: Bank = {
  comfort: {
    ar: ['متزعلش، الدنيا بتلف وترجع.', 'أنا فاهمك، وكل مشكلة ليها حل.', 'خد نفس عميق، إحنا مش لوحدنا.'],
    en: ['Easy, things turn around.', 'I hear you, and there is a way through.', 'Breathe. We are not alone in this.'],
  },
  agree: {
    ar: ['أنا كمان حاسس بكده بالظبط.', 'والله عندك حق في كل كلمة.', 'نفس اللي بيحصلي أنا كمان.'],
    en: ['I feel exactly the same.', 'You are right, every word.', 'That is happening to me too.'],
  },
  dismiss: {
    ar: ['كل واحد همه همه.', 'مش وقته دلوقتي بصراحة.', 'سيبك من الكلام ده.'],
    en: ['Everyone carries their own load.', 'Not the moment for this, honestly.', 'Drop it.'],
  },
  flirt: {
    ar: ['تعالى ننسى الدنيا شوية.', 'وجودك جنبي يكفيني.', 'بحب اللحظة دي معاك.'],
    en: ["Let's forget the world for a bit.", 'Having you here is enough.', 'I love this moment with you.'],
  },
  threat: {
    ar: ['ماتزودهاش معايا.', 'أنا مش هسمح بكده.', 'خد بالك من نفسك.'],
    en: ["Don't push me.", "I won't allow that.", 'Watch yourself.'],
  },
  greet: {
    ar: ['أهلاً بيك، نورت.', 'إزيك؟ أخبارك إيه؟', 'أهلاً، تعالى نقعد.'],
    en: ['Good to see you.', 'How have you been?', 'Come, sit with me.'],
  },
};

function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(Math.floor(seed)) % list.length];
}

function fill(template: string, agent: AgentData, other: AgentData, ctx: VoiceContext): string {
  return template
    .replace(/{name}/g, other.name.split(' ')[0])
    .replace(/{place}/g, ctx.locationName)
    .replace(/{amount}/g, `$${Math.max(0, Math.round(agent.stats.money))}`)
    .replace(/{n}/g, String(agent.childIds?.length ?? 0));
}

function compose(
  agent: AgentData,
  other: AgentData,
  mind: Mind,
  act: Act,
  ctx: VoiceContext,
  seed: number,
  reply = false,
): string {
  const lang = ctx.language;
  const opener = pick(OPENERS[act][lang], seed);
  const bodyBank = reply && REPLY_BODIES[act] ? REPLY_BODIES[act] : BODIES[mind.topic];
  const body = pick(bodyBank[lang], seed * 7 + 3);
  const closer = pick(CLOSERS[mind.posture][lang], seed * 13 + 5);
  return `${fill(opener, agent, other, ctx)} ${fill(body, agent, other, ctx)} ${fill(closer, agent, other, ctx)}`;
}

function chooseAct(mind: Mind, seed: number): Act {
  switch (mind.posture) {
    case 'flirty': return 'flirt';
    case 'angry': return mind.values.dignity > 60 ? 'threat' : 'complain';
    case 'ashamed': return 'confess';
    case 'proud': return 'brag';
    case 'weary': return 'complain';
    case 'hopeful': return Math.random() < 0.5 ? 'plan' : 'greet';
    case 'scheming': return 'probe';
    case 'warm': return 'greet';
    default: return seed % 2 === 0 ? 'greet' : 'complain';
  }
}

/** The listener answers from its own mind, not from the speaker's script. */
function chooseReply(speaker: Mind, listener: Mind): Act {
  if (speaker.posture === 'flirty') {
    return listener.bond === 'dating' || listener.bond === 'engaged' || listener.bond === 'married'
      ? 'flirt'
      : 'dismiss';
  }
  if (speaker.posture === 'ashamed' || speaker.posture === 'weary') {
    if (listener.values.compassion > 62) return 'comfort';
    if (listener.values.compassion < 32) return 'dismiss';
    return 'agree';
  }
  if (speaker.posture === 'angry') {
    return listener.values.dignity > 60 ? 'threat' : 'dismiss';
  }
  if (speaker.posture === 'proud') {
    return listener.values.ambition > 60 ? 'agree' : 'dismiss';
  }
  if (speaker.posture === 'scheming') {
    return listener.values.honesty > 65 ? 'dismiss' : 'agree';
  }
  return listener.values.compassion > 55 ? 'comfort' : 'agree';
}

/**
 * Build a full two-line exchange. Both lines depend on both minds, so the same
 * pair can argue, comfort, flirt or trade complaints depending on the day.
 */
export function generateExchange(
  agentA: AgentData,
  agentB: AgentData,
  ctx: VoiceContext,
): GeneratedExchange {
  const mindA = readMind(agentA, agentB, ctx);
  const mindB = readMind(agentB, agentA, ctx);

  const seed = (agentA.id.length * 31 + agentB.id.length * 17 + ctx.day * 13 + agentA.stats.mood) | 0;
  const actA = chooseAct(mindA, seed);
  const actB = chooseReply(mindA, mindB);

  const textA = compose(agentA, agentB, mindA, actA, ctx, seed);
  const textB = compose(agentB, agentA, mindB, actB, ctx, seed * 3 + 11, true);

  return { textA, textB, actA, actB, postureA: mindA.posture, postureB: mindB.posture, topic: mindA.topic };
}
