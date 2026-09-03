import { getCairoCalendarDateTime } from './_motivation-schedule.js'

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const MESSAGE_STEP = 37
const MESSAGE_OFFSET = 17

export const DAILY_MOTIVATION_TITLES = Object.freeze({
  en: 'Good Morning ☀️',
  tr: 'Günaydın ☀️',
})

export const DAILY_MOTIVATION_TITLE = DAILY_MOTIVATION_TITLES.en

export const DAILY_MOTIVATION_MESSAGES = Object.freeze([
  { en: 'Start the day with confidence.', tr: 'Güne kendine güvenerek başla.' },
  { en: 'Focus on your goal.', tr: 'Hedefine odaklan.' },
  { en: 'You can do this.', tr: 'Bunu başarabilirsin.' },
  { en: 'Give your best today.', tr: 'Bugün elinden gelenin en iyisini yap.' },
  { en: 'Today is a new opportunity.', tr: 'Bugün yeni bir fırsat.' },
  { en: 'Begin with a clear plan.', tr: 'Net bir planla başla.' },
  { en: 'Take the first step.', tr: 'İlk adımı at.' },
  { en: 'Start now.', tr: 'Şimdi başla.' },
  { en: 'Choose to be positive today.', tr: 'Bugün olumlu olmayı seç.' },
  { en: 'A good start makes work easier.', tr: 'İyi bir başlangıç işi kolaylaştırır.' },
  { en: 'Set your goal and begin.', tr: 'Hedefini belirle ve başla.' },
  { en: 'Start the day with energy.', tr: 'Güne enerjik başla.' },
  { en: 'Make today count.', tr: 'Bugünü değerli kıl.' },
  { en: 'Bring your full attention to today.', tr: 'Tüm dikkatini bugüne ver.' },
  { en: 'One good decision can improve your day.', tr: 'İyi bir karar gününü daha iyi yapabilir.' },
  { en: 'Do one thing at a time.', tr: 'Her seferinde tek bir iş yap.' },
  { en: 'Finish what you started.', tr: 'Başladığın işi bitir.' },
  { en: 'Turn your plan into action.', tr: 'Planını uygulamaya geçir.' },
  { en: 'Use your time wisely.', tr: 'Zamanını iyi değerlendir.' },
  { en: 'Start with the most important task.', tr: 'En önemli işle başla.' },
  { en: 'Keep your work simple and clear.', tr: 'İşini basit ve anlaşılır tut.' },
  { en: 'Pay attention to the details.', tr: 'Ayrıntılara dikkat et.' },
  { en: 'Complete one useful task today.', tr: 'Bugün faydalı bir işi tamamla.' },
  { en: 'Work with care.', tr: 'Özenle çalış.' },
  { en: 'Stay focused on your task.', tr: 'Yaptığın işe odaklan.' },
  { en: 'Take action without delay.', tr: 'Gecikmeden harekete geç.' },
  { en: 'Prepare before you begin.', tr: 'Başlamadan önce hazırlan.' },
  { en: 'Check your work carefully.', tr: 'İşini dikkatlice kontrol et.' },
  { en: 'Make every minute useful.', tr: 'Her dakikayı verimli kullan.' },
  { en: 'Do your work with purpose.', tr: 'İşini bir amaçla yap.' },
  { en: 'Keep going.', tr: 'Devam et.' },
  { en: 'Your effort matters.', tr: 'Emeğin önemli.' },
  { en: 'Small steps create big results.', tr: 'Küçük adımlar büyük sonuçlar yaratır.' },
  { en: 'Good results take time.', tr: 'İyi sonuçlar zaman alır.' },
  { en: 'Be patient and continue.', tr: 'Sabırlı ol ve devam et.' },
  { en: 'Every effort moves you forward.', tr: 'Her çaba seni ileri taşır.' },
  { en: 'Try again with what you learned.', tr: 'Öğrendiklerinle yeniden dene.' },
  { en: 'Consistency brings results.', tr: 'İstikrar sonuç getirir.' },
  { en: 'One more step can make a difference.', tr: 'Bir adım daha fark yaratabilir.' },
  { en: 'Stay strong when work gets difficult.', tr: 'İş zorlaştığında güçlü kal.' },
  { en: 'Keep working toward your goal.', tr: 'Hedefin için çalışmaya devam et.' },
  { en: 'Your hard work will bring results.', tr: 'Emeğin sonuç getirecek.' },
  { en: 'Slow progress is still progress.', tr: 'Yavaş ilerlemek de ilerlemektir.' },
  { en: 'Challenges help you improve.', tr: 'Zorluklar gelişmene yardımcı olur.' },
  { en: 'Complete today’s work with care.', tr: 'Bugünün işini özenle tamamla.' },
  { en: 'Trust yourself.', tr: 'Kendine güven.' },
  { en: 'Believe in your ability.', tr: 'Yeteneğine inan.' },
  { en: 'You are stronger than you think.', tr: 'Sandığından daha güçlüsün.' },
  { en: 'You are ready for today.', tr: 'Bugün için hazırsın.' },
  { en: 'Use your strengths.', tr: 'Güçlü yönlerini kullan.' },
  { en: 'Be confident in your decisions.', tr: 'Kararlarına güven.' },
  { en: 'You can learn difficult things.', tr: 'Zor şeyleri öğrenebilirsin.' },
  { en: 'Practice helps you improve.', tr: 'Pratik yapmak gelişmene yardımcı olur.' },
  { en: 'Learn something useful today.', tr: 'Bugün faydalı bir şey öğren.' },
  { en: 'Take the next step with confidence.', tr: 'Bir sonraki adımı güvenle at.' },
  { en: 'Be proud of your progress.', tr: 'İlerlemenle gurur duy.' },
  { en: 'Face the day with courage.', tr: 'Günü cesaretle karşıla.' },
  { en: 'You are making progress.', tr: 'İlerliyorsun.' },
  { en: 'Remember what you can achieve.', tr: 'Neler başarabileceğini hatırla.' },
  { en: 'Use what you learned yesterday.', tr: 'Dün öğrendiklerini bugün kullan.' },
  { en: 'Share your ideas clearly.', tr: 'Fikirlerini açıkça paylaş.' },
  { en: 'Listen carefully.', tr: 'Dikkatle dinle.' },
  { en: 'Ask for help when you need it.', tr: 'İhtiyacın olduğunda yardım iste.' },
  { en: 'Help a teammate today.', tr: 'Bugün bir ekip arkadaşına yardım et.' },
  { en: 'Work together toward the goal.', tr: 'Hedefe ulaşmak için birlikte çalış.' },
  { en: 'Respect everyone’s effort.', tr: 'Herkesin emeğine saygı göster.' },
  { en: 'A kind word can improve the day.', tr: 'Nazik bir söz günü güzelleştirebilir.' },
  { en: 'Thank someone for their help.', tr: 'Yardım eden birine teşekkür et.' },
  { en: 'Good teamwork makes work easier.', tr: 'İyi ekip çalışması işi kolaylaştırır.' },
  { en: 'Share what you know.', tr: 'Bildiklerini paylaş.' },
  { en: 'Support your team.', tr: 'Ekibini destekle.' },
  { en: 'Speak with confidence.', tr: 'Kendine güvenerek konuş.' },
  { en: 'Keep your word.', tr: 'Sözünü tut.' },
  { en: 'Stay respectful when you disagree.', tr: 'Aynı fikirde olmadığında da saygılı ol.' },
  { en: 'A positive attitude helps everyone.', tr: 'Olumlu bir tutum herkese yardımcı olur.' },
  { en: 'Learn from your mistakes.', tr: 'Hatalarından ders çıkar.' },
  { en: 'Use feedback to improve.', tr: 'Geri bildirimleri gelişmek için kullan.' },
  { en: 'Look for a practical solution.', tr: 'Uygulanabilir bir çözüm ara.' },
  { en: 'Solve one small problem today.', tr: 'Bugün küçük bir sorunu çöz.' },
  { en: 'Try a better method.', tr: 'Daha iyi bir yöntem dene.' },
  { en: 'Be open to new ideas.', tr: 'Yeni fikirlere açık ol.' },
  { en: 'Turn one idea into action.', tr: 'Bir fikri uygulamaya geçir.' },
  { en: 'Improve one thing today.', tr: 'Bugün bir şeyi geliştir.' },
  { en: 'Make today better than yesterday.', tr: 'Bugünü dünden daha iyi yap.' },
  { en: 'Notice what went well today.', tr: 'Bugün nelerin iyi gittiğini fark et.' },
  { en: 'Celebrate today’s success.', tr: 'Bugünkü başarını kutla.' },
  { en: 'Be proud of your work.', tr: 'Yaptığın işle gurur duy.' },
  { en: 'End the day satisfied with your effort.', tr: 'Günü emeğinden memnun olarak bitir.' },
  { en: 'Prepare well for tomorrow.', tr: 'Yarına iyi hazırlan.' },
  { en: 'Finish the day with confidence.', tr: 'Günü kendine güvenerek tamamla.' },
])

export function getCairoCalendarDate(date = new Date()) {
  const values = getCairoCalendarDateTime(date)
  return {
    year: values.year,
    month: values.month,
    day: values.day,
  }
}

export function getDailyMotivation(date = new Date()) {
  const { year, month, day } = getCairoCalendarDate(date)
  const dayNumber = Math.floor(
    Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY,
  )
  const messageCount = DAILY_MOTIVATION_MESSAGES.length
  const messageIndex = (
    (dayNumber * MESSAGE_STEP + MESSAGE_OFFSET) % messageCount + messageCount
  ) % messageCount
  const message = DAILY_MOTIVATION_MESSAGES[messageIndex]
  const url = '/'

  return {
    date: [year, month, day]
      .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, '0'))
      .join('-'),
    messageId: messageIndex + 1,
    title: DAILY_MOTIVATION_TITLES.en,
    body: message.en,
    url,
    messages: {
      en: { title: DAILY_MOTIVATION_TITLES.en, body: message.en, url },
      tr: { title: DAILY_MOTIVATION_TITLES.tr, body: message.tr, url },
    },
  }
}
