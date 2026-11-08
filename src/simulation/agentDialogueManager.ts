import { AgentData, CityEvent, SimulationTime } from '../types/simulation';

export interface DialogueExchange {
  textA: string;
  textB: string;
  context: string;
}

/**
 * نظام إدارة الحوارات التلقائية بين الوكلاء في المدينة
 * Autonomous Agent Dialogue Manager with Smart Dynamic Templates & Context Awareness
 */
export class AgentDialogueManager {
  private language: 'ar' | 'en' = 'ar'; // الافتراضي: العربية كما طلب المستخدم

  public setLanguage(lang: 'ar' | 'en') {
    this.language = lang;
  }

  public getLanguage(): 'ar' | 'en' {
    return this.language;
  }

  /**
   * توليد حوار بين وكيلين عند التقائهما بناءً على الشخصية، المزاج، المكان، والأحداث
   */
  public generateDialogue(
    agentA: AgentData,
    agentB: AgentData,
    locationType: string,
    locationName: string,
    activeEvent: CityEvent | null
  ): DialogueExchange {
    const isAr = this.language === 'ar';

    // 1. الأولوية للأحداث الطارئة والعالمية في المدينة (Global City Events)
    if (activeEvent) {
      if (activeEvent.type === 'snowstorm') {
        return {
          context: isAr ? 'عاصفة ثلجية شتوية' : 'Winter Snowstorm',
          textA: isAr 
            ? `تساقط الثلوج كثيف جداً يا ${agentB.name}! لنبحث عن مأوى دافئ.`
            : `Look at this heavy snowfall, ${agentB.name}! The town is turning completely white.`,
          textB: isAr
            ? `كوب من الشوكولاتة الساخنة أو فنجان قهوة بجانب المدفأة هو الحل الأمثل!`
            : `It's freezing! Let's get hot cocoa at Cozy Cafe or warm up by the hearth.`
        };
      }

      if (activeEvent.type === 'coffee_promo') {
        return {
          context: isAr ? 'عرض القهوة المجانية' : 'Free Coffee Promo',
          textA: isAr
            ? `هل سمعت بعرض القهوة المجانية في المقهى يا ${agentB.name}؟`
            : `Did you catch the free coffee promo at Cozy Cafe, ${agentB.name}?`,
          textB: isAr
            ? `نعم! القهوة هناك اليوم لا تُفوت، سأرافقك للحصول على فنجان فوراً!`
            : `Yes! Sofia's oat latte is pure fuel today. Grab one with me!`
        };
      }

      if (activeEvent.type === 'city_decree') {
        return {
          context: isAr ? 'مرسوم البلدية الجديد' : 'City Hall Civic Decree',
          textA: isAr
            ? `أجراس مبنى البلدية تدعو الجميع لسماع المرسوم الجديد يا ${agentB.name}.`
            : `Did you hear the new civic decree from City Hall, ${agentB.name}?`,
          textB: isAr
            ? `سمعتها! القرارات الجديدة تدعم المبادرات المحلية وتطور المدينة بشكل رائع.`
            : `Yes! The mayor just passed an initiative to boost local business innovation.`
        };
      }

      if (activeEvent.type === 'rainstorm') {
        return {
          context: isAr ? 'عاصفة ماطرة' : 'Sudden Rainstorm',
          textA: isAr
            ? `احتمِ من المطر يا ${agentB.name}! هذه العاصفة هطلت بشكل مفاجئ.`
            : `Stay dry, ${agentB.name}! This rain came out of nowhere.`,
          textB: isAr
            ? `شكراً يا ${agentA.name}! حمداً لله أننا وجدنا مكاناً مظللاً هنا.`
            : `Thanks ${agentA.name}! Good thing we're sheltered here.`
        };
      }

      if (activeEvent.type === 'power_outage') {
        return {
          context: isAr ? 'انقطاع الكهرباء' : 'Power Outage',
          textA: isAr
            ? `انقطعت الكهرباء عن مكاتب التكنولوجيا! يبدو أنها استراحة إجبارية.`
            : `Power grid's down at the office! Forced break time.`,
          textB: isAr
            ? `أحياناً الابتعاد عن الشاشات يكون فرصة رائعة للاسترخاء والتأمل.`
            : `Honestly, stepping away from the monitors is a blessing in disguise.`
        };
      }

      if (activeEvent.type === 'festival') {
        return {
          context: isAr ? 'مهرجان الحديقة' : 'Park Festival',
          textA: isAr
            ? `أجواء المهرجان مبهجة للغاية! الموسيقى هنا تنشر السعادة.`
            : `The festival vibe here is amazing! Great music and food stalls.`,
          textB: isAr
            ? `حضور رائع اليوم يا ${agentA.name}، الجميع يستمتعون بالاحتفال!`
            : `Best turnout of the season, ${agentA.name}! Look at this crowd.`
        };
      }
    }

    // 2. الحوارات السياقية الذكية بناءً على القطاع والمكان (Location-Specific Templates)
    if (locationType === 'cafe') {
      const cafeOptions = isAr ? [
        {
          context: 'حديث عن العمل والإرهاق',
          textA: `${agentA.name} (يشرب قهوته): "أهلاً يا ${agentB.name}، الضغط في العمل اليوم كان لا يُطاق حقاً!"`,
          textB: `${agentB.name}: "فعلاً يا ${agentA.name}، أحتاج إلى استراحة طويلة.. هل تشاركني نفس الرأي؟"`
        },
        {
          context: 'دردشة عامة وخطط المستقبل',
          textA: `${agentA.name}: "تخيل أنني أخطط لتطوير مشروع تقني خاص يخدم مجتمع المدينة."`,
          textB: `${agentB.name} (يبتسم): "خطوة جريئة يا ${agentA.name}! لكنها تستحق المحاولة والمخاطرة بالتأكيد."`
        },
        {
          context: 'تذوق القهوة والروقان',
          textA: `نكهة القهوة المحمصة اليوم تمنح دفعة طاقة لا مثيل لها!`,
          textB: `بالضبط! رائحة الإسبريسو هنا كفيلة بتصفية الذهن تماماً.`
        }
      ] : [
        {
          context: 'Work stress & coffee break',
          textA: `${agentA.name} (sipping coffee): "Hey ${agentB.name}, work pressure was intense today!"`,
          textB: `${agentB.name}: "Truly ${agentA.name}, a long coffee break was sorely needed."`
        },
        {
          context: 'Future plans',
          textA: `${agentA.name}: "Thinking of launching an independent creative tech project."`,
          textB: `${agentB.name} (smiles): "Bold move ${agentA.name}! Totally worth the venture."`
        }
      ];
      return cafeOptions[Math.floor(Math.random() * cafeOptions.length)];
    }

    if (locationType === 'park') {
      const parkOptions = isAr ? [
        {
          context: 'الاسترخاء والطقس',
          textA: `${agentA.name} (يتنفس هواءً نقياً): "الجو في هذه الحديقة ينسي المرء تعب الأسبوع بأكمله."`,
          textB: `${agentB.name}: "صدقت، الطبيعة هنا هادئة جداً وتصفية الذهن ضرورية بين الحين والآخر."`
        },
        {
          context: 'الحديث عن اللياقة والنشاط',
          textA: `${agentA.name}: "هل لاحظت كم زاد نشاطنا البدني مؤخراً؟ المشي بجوار البحيرة رائع."`,
          textB: `${agentB.name}: "نعم، الصحة البدنية تنعكس مباشرة على صفاء المزاج والسعادة اليومية."`
        },
        {
          context: 'مشاهدة الطبيعة والبط في البحيرة',
          textA: `انظر إلى البط وهو يسبح بهدوء فوق سطح الماء الصافي.`,
          textB: `مشهد مريح للأعصاب.. الجلوس تحت ظلال الصفصاف هنا لا يُمل.`
        }
      ] : [
        {
          context: 'Relaxation & fresh air',
          textA: `${agentA.name} (taking deep breath): "The fresh park breeze washes away all weekly fatigue."`,
          textB: `${agentB.name}: "Agreed, clearing the mind near the pond does wonders."`
        },
        {
          context: 'Fitness & wellness walk',
          textA: `${agentA.name}: "Walking around the lake really boosts physical vitality."`,
          textB: `${agentB.name}: "Absolutely, body wellness directly elevates our daily mood."`
        }
      ];
      return parkOptions[Math.floor(Math.random() * parkOptions.length)];
    }

    if (locationType === 'office') {
      return isAr ? {
        context: 'ساعات العمل والمشاريع التقنية',
        textA: `نظام الخوارزميات الجديد يعمل بكفاءة استثنائية، لكن يحتاج لاختبارات إضافية.`,
        textB: `التركيز على جودة البيانات وحل المشكلات هو الأساس لنجاح الفريق يا ${agentA.name}.`
      } : {
        context: 'Tech sprints and code optimization',
        textA: `The algorithmic models are performing at peak throughput today!`,
        textB: `Staying focused on test coverage is how we guarantee stability.`
      };
    }

    if (locationType === 'bank') {
      return isAr ? {
        context: 'إدارة الأموال والادخار',
        textA: `أفكر في إيداع جزء من أرباح العمل في الخزينة الاستثمارية الآمنة هنا.`,
        textB: `فكرة استراتيجية ذكية يا ${agentA.name}، الادخار يضمن الاستقرار والنمو المالي.`
      } : {
        context: 'Savings vault & financial growth',
        textA: `Planning to deposit savings into Metro Bank's high-yield vault.`,
        textB: `Smart move ${agentA.name}, financial security gives immense peace of mind.`
      };
    }

    if (locationType === 'market') {
      return isAr ? {
        context: 'التسوق والمنتجات الطازجة',
        textA: `المخبوزات والفاكهة الطازجة هنا في السوق لها رائحة لا تقاوم!`,
        textB: `التغذية السليمة هي الوقود الأساسي لطاقة الجسم ورفع الإنتاجية طوال اليوم.`
      } : {
        context: 'Artisan food & local trade',
        textA: `The freshly baked loaves and artisan honey smell delightful today!`,
        textB: `Good nutrition is pure fuel for high daily energy and good mood.`
      };
    }

    if (locationType === 'hospital') {
      return isAr ? {
        context: 'الرعاية الصحية والنقاهة',
        textA: `الفحص الطبي الدوري وأخذ فترات راحة كافية يقيان من الإجهاد الشديد.`,
        textB: `نصيحة ثمينة يا ${agentA.name}، الصحة هي أثمن ما يملكه الإنسان.`
      } : {
        context: 'Healthcare wellness & recovery',
        textA: `Regular wellness checks and restorative rest keep exhaustion away.`,
        textB: `Sound advice ${agentA.name}, maintaining physical health is our top asset.`
      };
    }

    if (locationType === 'cityhall') {
      return isAr ? {
        context: 'القرارات البلدية والمشاركة المدنية',
        textA: `القرارات الجديدة التي أعلنتها البلدية ستطور مدينتنا بشكل ملحوظ.`,
        textB: `المشاركة المجتمعية هي جوهر تقدم هذه المدينة الذكية ورفاهية سكانها.`
      } : {
        context: 'Civic governance & municipal council',
        textA: `The municipal council's initiatives are steadily elevating city infrastructure.`,
        textB: `Active civic engagement is the heartbeat of a thriving autonomous city.`
      };
    }

    if (locationType === 'police') {
      return isAr ? {
        context: 'الأمن والسلامة العامة',
        textA: `فرق الطوارئ مستعدة دائماً للتعامل مع أي طارئ في المدينة.`,
        textB: `الشعور بالأمان في شوارع المدينة لا يقدر بثمن يا ${agentA.name}.`
      } : {
        context: 'Public safety & rapid response',
        textA: `Emergency teams maintain watchful readiness across all avenues.`,
        textB: `Peace of mind in our streets is priceless, ${agentA.name}.`
      };
    }

    // افتراضي عام (Default fallback)
    return isAr ? {
      context: 'لقاء ودود عفوي',
      textA: `أهلاً بك يا ${agentB.name}! يسعدني دائماً لقاؤك في ${locationName}.`,
      textB: `مرحباً يا ${agentA.name}! أتمنى لك يوماً حافلاً بالإنجاز وراحة البال.`
    } : {
      context: 'Casual town greeting',
      textA: `Hey ${agentB.name}! Great seeing you around ${locationName}.`,
      textB: `Hey ${agentA.name}! Hope you're having an inspiring and productive day.`
    };
  }
}

export const dialogueManager = new AgentDialogueManager();
