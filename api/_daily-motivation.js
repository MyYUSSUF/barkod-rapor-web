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
  { en: 'Lost time is never found again.', tr: 'Kaybedilen zaman bir daha bulunmaz.', author: 'Benjamin Franklin' },
  { en: 'There are no gains without pains.', tr: 'Emek olmadan kazanç olmaz.', author: 'Benjamin Franklin' },
  { en: 'Drive thy business; let not that drive thee.', tr: 'İşini sen yönet; işin seni yönetmesin.', author: 'Benjamin Franklin' },
  { en: 'Well done is better than well said.', tr: 'İyi yapılmış bir iş, iyi söylenmiş sözden üstündür.', author: 'Benjamin Franklin' },
  { en: 'Diligence is the mother of good luck.', tr: 'Şansı yaratan çalışkanlıktır.', author: 'Benjamin Franklin' },
  { en: 'Never leave that till tomorrow which you can do today.', tr: 'Bugün yapabileceğin işi yarına bırakma.', author: 'Benjamin Franklin' },
  { en: 'One today is worth two tomorrows.', tr: 'Bir bugün, iki yarına bedeldir.', author: 'Benjamin Franklin' },
  { en: 'Employ thy time well, if thou meanest to gain leisure.', tr: 'Boş zaman istiyorsan zamanını iyi kullan.', author: 'Benjamin Franklin' },
  { en: 'A small leak will sink a great ship.', tr: 'Küçük bir sızıntı büyük bir gemiyi batırır.', author: 'Benjamin Franklin' },
  { en: 'Constant dropping wears away stones.', tr: 'Sürekli damlayan su taşı aşındırır.', author: 'Benjamin Franklin' },
  { en: 'Want of care does us more damage than want of knowledge.', tr: 'Dikkatsizlik bize bilgisizlikten daha çok zarar verir.', author: 'Benjamin Franklin' },
  { en: 'Search others for their virtues, thyself for thy vices.', tr: 'Erdemi başkalarında, kusuru kendinde ara.', author: 'Benjamin Franklin' },
  { en: 'They that will not be counselled cannot be helped.', tr: 'Öğüt dinlemeyen kişiye yardım edilemez.', author: 'Benjamin Franklin' },
  { en: 'Keep thy shop, and thy shop will keep thee.', tr: 'İşine sahip çık; işin de sana sahip çıkar.', author: 'Benjamin Franklin' },
  { en: 'He that can have patience can have what he will.', tr: 'Sabırlı olan, istediğine ulaşabilir.', author: 'Benjamin Franklin' },
  { en: 'Our life is frittered away by detail.', tr: 'Hayatımız ayrıntılar arasında tükenip gider.', author: 'Henry David Thoreau' },
  { en: 'Simplify, simplify!', tr: 'Sadeleştir, sadeleştir!', author: 'Henry David Thoreau' },
  { en: 'To be awake is to be alive.', tr: 'Uyanık olmak, gerçekten yaşamaktır.', author: 'Henry David Thoreau' },
  { en: 'Things do not change; we change.', tr: 'Şeyler değişmez; biz değişiriz.', author: 'Henry David Thoreau' },
  { en: 'Read much, but not too many books.', tr: 'Çok oku, fakat gereğinden fazla kitaba dağılma.', author: 'Benjamin Franklin' },
  { en: 'Nothing can bring you peace but yourself.', tr: 'Sana huzuru kendinden başka hiçbir şey getiremez.', author: 'Ralph Waldo Emerson' },
  { en: 'Do the thing, and you shall have the power.', tr: 'Yapman gerekeni yap; gücü o zaman bulursun.', author: 'Ralph Waldo Emerson' },
  { en: 'Insist on yourself; never imitate.', tr: 'Kendin olmakta ısrar et; kimseyi taklit etme.', author: 'Ralph Waldo Emerson' },
  { en: 'The only way to have a friend is to be one.', tr: 'Bir dosta sahip olmanın tek yolu, dost olmaktır.', author: 'Ralph Waldo Emerson' },
  { en: 'Nothing great was ever achieved without enthusiasm.', tr: 'Hiçbir büyük başarı coşku olmadan elde edilmemiştir.', author: 'Ralph Waldo Emerson' },
  { en: 'Waste no more time arguing what a good man should be. Be one.', tr: 'İyi bir insanın nasıl olması gerektiğini tartışarak zaman kaybetme; öyle biri ol.', author: 'Marcus Aurelius' },
  { en: 'You have power over your mind, not outside events.', tr: 'Dış olaylar üzerinde değil, kendi zihnin üzerinde gücün vardır.', author: 'Marcus Aurelius' },
  { en: 'If it is not right, do not do it; if it is not true, do not say it.', tr: 'Doğru değilse yapma; gerçek değilse söyleme.', author: 'Marcus Aurelius' },
  { en: 'Confine yourself to the present.', tr: 'Kendini içinde bulunduğun ana ver.', author: 'Marcus Aurelius' },
  { en: 'The happiness of your life depends upon the quality of your thoughts.', tr: 'Hayatının mutluluğu, düşüncelerinin niteliğine bağlıdır.', author: 'Marcus Aurelius' },
  { en: 'Very little is needed to make a happy life; it is all within yourself.', tr: 'Mutlu bir hayat için çok az şey gerekir; hepsi kendi içindedir.', author: 'Marcus Aurelius' },
  { en: 'The universe is change; our life is what our thoughts make it.', tr: 'Evren değişimdir; hayatımızı düşüncelerimiz biçimlendirir.', author: 'Marcus Aurelius' },
  { en: 'It is impossible to learn what you think you already know.', tr: 'Zaten bildiğini düşündüğün bir şeyi öğrenemezsin.', author: 'Epictetus' },
  { en: 'Make the best use of what is in your power, and take the rest as it happens.', tr: 'Gücünün yettiğini en iyi şekilde yap; gerisini olduğu gibi karşıla.', author: 'Epictetus' },
  { en: 'No great thing is created suddenly.', tr: 'Hiçbir büyük şey bir anda ortaya çıkmaz.', author: 'Epictetus' },
  { en: 'People are disturbed not by things, but by the views they take of them.', tr: 'İnsanları olaylar değil, olaylara bakışları rahatsız eder.', author: 'Epictetus' },
  { en: 'First say to yourself what you would be; then do what you have to do.', tr: 'Önce nasıl biri olmak istediğini söyle; sonra gerekeni yap.', author: 'Epictetus' },
  { en: 'Demand not that events should happen as you wish; wish them to happen as they do happen.', tr: 'Olayların istediğin gibi olmasını bekleme; onları olduğu gibi kabul et.', author: 'Epictetus' },
  { en: 'While we are postponing, life speeds by.', tr: 'Biz ertelerken hayat hızla geçer.', author: 'Seneca' },
  { en: 'It is better to offer no excuse than a bad one.', tr: 'Kötü bir mazeret sunmaktansa hiç mazeret sunmamak daha iyidir.', author: 'George Washington' },
  { en: 'Begin at once to live, and count each day as a separate life.', tr: 'Yaşamaya hemen başla ve her günü ayrı bir hayat say.', author: 'Seneca' },
  { en: 'Associate with people who are likely to improve you.', tr: 'Seni geliştirecek insanlarla birlikte ol.', author: 'Seneca' },
  { en: 'As long as you live, keep learning how to live.', tr: 'Yaşadığın sürece nasıl yaşayacağını öğrenmeye devam et.', author: 'Seneca' },
  { en: 'Little strokes fell great oaks.', tr: 'Küçük vuruşlar büyük meşeleri devirir.', author: 'Benjamin Franklin' },
  { en: 'Prove your words by your deeds.', tr: 'Sözlerini davranışlarınla kanıtla.', author: 'Seneca' },
  { en: 'Early to bed and early to rise makes a man healthy, wealthy, and wise.', tr: 'Erken yatıp erken kalkmak insanı sağlıklı, varlıklı ve bilge yapar.', author: 'Benjamin Franklin' },
  { en: 'Alone we can do so little; together we can do so much.', tr: 'Tek başımıza çok az, birlikte çok şey yapabiliriz.', author: 'Helen Keller' },
  { en: 'Keep your face to the sunshine and you cannot see the shadows.', tr: 'Yüzünü güneşe dönersen gölgeleri göremezsin.', author: 'Helen Keller' },
  { en: 'Never bend your head. Always hold it high.', tr: 'Başını asla eğme; daima dik tut.', author: 'Helen Keller' },
  { en: 'Life is either a daring adventure or nothing.', tr: 'Hayat ya cesur bir maceradır ya da hiçbir şey.', author: 'Helen Keller' },
  { en: 'It is never too late to give up our prejudices.', tr: 'Önyargılarımızdan vazgeçmek için asla geç değildir.', author: 'Henry David Thoreau' },
  { en: 'We are never really happy until we try to brighten the lives of others.', tr: 'Başkalarının hayatını aydınlatmaya çalışmadan gerçekten mutlu olamayız.', author: 'Helen Keller' },
  { en: 'Failures become victories if they make us wise-hearted.', tr: 'Başarısızlıklar bizi daha bilge yaparsa zafere dönüşür.', author: 'Helen Keller' },
  { en: 'The universe is wider than our views of it.', tr: 'Evren, ona dair görüşlerimizden daha geniştir.', author: 'Henry David Thoreau' },
  { en: 'The optimist believes, attempts, and achieves.', tr: 'İyimser insan inanır, dener ve başarır.', author: 'Helen Keller' },
  { en: 'Your success and happiness lie in you.', tr: 'Başarın ve mutluluğun senin içindedir.', author: 'Helen Keller' },
  { en: 'No pessimist ever discovered the secrets of the stars or sailed to an uncharted land.', tr: 'Hiçbir kötümser yıldızların sırrını keşfetmedi ya da bilinmeyen bir ülkeye yelken açmadı.', author: 'Helen Keller' },
  { en: 'A happy life consists not in the absence, but in the mastery of hardships.', tr: 'Mutlu hayat, zorlukların yokluğunda değil, onların üstesinden gelmektedir.', author: 'Helen Keller' },
  { en: 'I declare after all there is no enjoyment like reading!', tr: 'Her şeye rağmen okumak gibisi yoktur!', author: 'Jane Austen' },
  { en: 'Think only of the past as its remembrance gives you pleasure.', tr: 'Geçmişi yalnızca onu hatırlamak sana mutluluk verdiği sürece düşün.', author: 'Jane Austen' },
  { en: 'There is no charm equal to tenderness of heart.', tr: 'Hiçbir güzellik, kalbin şefkatine denk değildir.', author: 'Jane Austen' },
  { en: 'Forever is composed of nows.', tr: 'Sonsuzluk, içinde bulunduğumuz anlardan oluşur.', author: 'Emily Dickinson' },
  { en: 'Experience is the name everyone gives to their mistakes.', tr: 'Deneyim, herkesin hatalarına verdiği addır.', author: 'Oscar Wilde' },
  { en: 'To love oneself is the beginning of a lifelong romance.', tr: 'Kendini sevmek, ömür boyu sürecek bir aşkın başlangıcıdır.', author: 'Oscar Wilde' },
  { en: 'Love all, trust a few, do wrong to none.', tr: 'Herkesi sev, az kişiye güven, kimseye kötülük etme.', author: 'William Shakespeare' },
  { en: 'Take each man’s censure, but reserve thy judgment.', tr: 'Herkesin görüşünü dinle ama hemen hüküm verme.', author: 'William Shakespeare' },
  { en: 'Brevity is the soul of wit.', tr: 'Kısa ve öz olmak, zekânın özüdür.', author: 'William Shakespeare' },
  { en: 'This above all: to thine own self be true.', tr: 'Her şeyden önce kendine karşı dürüst ol.', author: 'William Shakespeare' },
  { en: 'There is nothing either good or bad, but thinking makes it so.', tr: 'Hiçbir şey kendi başına iyi ya da kötü değildir; onu öyle yapan düşüncedir.', author: 'William Shakespeare' },
  { en: 'Wisely and slow. They stumble that run fast.', tr: 'Akıllıca ve yavaş ilerle; hızlı koşan tökezler.', author: 'William Shakespeare' },
  { en: 'Sweet are the uses of adversity.', tr: 'Zorlukların da yararlı yanları vardır.', author: 'William Shakespeare' },
  { en: 'Give every man thy ear, but few thy voice.', tr: 'Herkesi dinle, ama düşünceni az kişiyle paylaş.', author: 'William Shakespeare' },
  { en: 'No legacy is so rich as honesty.', tr: 'Hiçbir miras dürüstlük kadar değerli değildir.', author: 'William Shakespeare' },
  { en: 'Action is eloquence.', tr: 'Eylem, sözden daha etkilidir.', author: 'William Shakespeare' },
  { en: 'Speak less than thou knowest.', tr: 'Bildiğinden daha az konuş.', author: 'William Shakespeare' },
  { en: 'We know what we are, but know not what we may be.', tr: 'Ne olduğumuzu biliriz ama ne olabileceğimizi bilmeyiz.', author: 'William Shakespeare' },
  { en: 'A gentleman is modest in speech, but exceeds in actions.', tr: 'Olgun insan sözlerinde ölçülüdür ve davranışlarıyla sözlerinin ötesine geçer.', author: 'Confucius' },
  { en: 'Learning without thought is labor lost; thought without learning is perilous.', tr: 'Düşünmeden öğrenmek boşa emektir; öğrenmeden düşünmek ise tehlikelidir.', author: 'Confucius' },
  { en: 'To see what is right and not to do it is want of courage.', tr: 'Doğru olanı görüp yapmamak cesaret eksikliğidir.', author: 'Confucius' },
  { en: 'When you see someone worthy, think of becoming like them.', tr: 'Değerli birini gördüğünde onun iyi yönlerini örnek al.', author: 'Confucius' },
  { en: 'Petty impatience confounds great projects.', tr: 'Küçük bir sabırsızlık, büyük işleri bozar.', author: 'Confucius' },
  { en: 'The cautious seldom err.', tr: 'Dikkatli davrananlar nadiren hata yapar.', author: 'Confucius' },
  { en: 'To make a mistake and not correct it—that, indeed, is a mistake.', tr: 'Hata yapıp onu düzeltmemek, işte asıl hata budur.', author: 'Confucius' },
  { en: 'A gentleman is consistent, not changeless.', tr: 'Olgun insan tutarlıdır ama değişime kapalı değildir.', author: 'Confucius' },
  { en: 'A gentleman is kind, but not wasteful.', tr: 'Olgun insan iyilikseverdir ama savurgan değildir.', author: 'Confucius' },
  { en: 'To understand is essential to progress.', tr: 'Anlamak, ilerleme için gereklidir.', author: 'Helen Keller' },
  { en: 'He who knows others is wise; he who knows himself is enlightened.', tr: 'Başkalarını bilen bilgedir; kendini bilen aydındır.', author: 'Lao Tzu' },
  { en: 'He who conquers others is strong; he who conquers himself is mighty.', tr: 'Başkalarını yenen güçlüdür; kendini yenen daha güçlüdür.', author: 'Lao Tzu' },
  { en: 'A journey of a thousand miles begins with a single step.', tr: 'Bin millik bir yolculuk tek bir adımla başlar.', author: 'Lao Tzu' },
  { en: 'The highest result of education is tolerance.', tr: 'Eğitimin en yüce sonucu hoşgörüdür.', author: 'Helen Keller' },
])

export function formatDailyMotivationBody(message, language) {
  return `${message[language]}\n— ${message.author}`
}

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
  const englishBody = formatDailyMotivationBody(message, 'en')
  const turkishBody = formatDailyMotivationBody(message, 'tr')

  return {
    date: [year, month, day]
      .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, '0'))
      .join('-'),
    messageId: messageIndex + 1,
    title: DAILY_MOTIVATION_TITLES.en,
    body: englishBody,
    url,
    messages: {
      en: { title: DAILY_MOTIVATION_TITLES.en, body: englishBody, url },
      tr: { title: DAILY_MOTIVATION_TITLES.tr, body: turkishBody, url },
    },
  }
}
