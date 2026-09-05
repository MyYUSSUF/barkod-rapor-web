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
  { en: 'Difficulties break some men but make others.', tr: 'Zorluklar bazı insanları yıkar, bazılarını ise güçlendirir.', author: 'Nelson Mandela' },
  { en: 'Well done is better than well said.', tr: 'İyi yapılmış bir iş, iyi söylenmiş bir sözden üstündür.', author: 'Benjamin Franklin' },
  { en: 'Diligence is the mother of good luck.', tr: 'Şansı yaratan çalışkanlıktır.', author: 'Benjamin Franklin' },
  { en: 'Have you somewhat to do to-morrow; do it to-day.', tr: 'Yarın yapacağın bir iş varsa, bugün yap.', author: 'Benjamin Franklin' },
  { en: 'One to-day is worth two to-morrows.', tr: 'Bugün, iki yarına bedeldir.', author: 'Benjamin Franklin' },
  { en: 'What you do makes a difference, and you have to decide what kind of difference you want to make.', tr: 'Yaptıkların fark yaratır; nasıl bir fark yaratmak istediğine sen karar vermelisin.', author: 'Jane Goodall' },
  { en: 'A small leak will sink a great ship.', tr: 'Küçük bir sızıntı büyük bir gemiyi batırır.', author: 'Benjamin Franklin' },
  { en: 'Constant dropping wears away stones.', tr: 'Sürekli damlayan su taşı aşındırır.', author: 'Benjamin Franklin' },
  { en: 'Want of care does us more damage than want of knowledge.', tr: 'Dikkatsizlik bize bilgisizlikten daha çok zarar verir.', author: 'Benjamin Franklin' },
  { en: 'Fight for the things that you care about, but do it in a way that will lead others to join you.', tr: 'Önemsediğin şeyler için mücadele et; ama bunu, başkalarının da sana katılmasını sağlayacak biçimde yap.', author: 'Ruth Bader Ginsburg' },
  { en: 'They that won\'t be counselled, can\'t be helped.', tr: 'Öğüt dinlemeyen kişiye yardım edilemez.', author: 'Benjamin Franklin' },
  { en: 'Keep thy shop, and thy shop will keep thee.', tr: 'İşine sahip çık; işin de sana sahip çıkar.', author: 'Benjamin Franklin' },
  { en: 'He that can have patience, can have what he will.', tr: 'Sabırlı olan, istediğine ulaşabilir.', author: 'Benjamin Franklin' },
  { en: 'Our life is frittered away by detail.', tr: 'Hayatımız ayrıntılar yüzünden parça parça boşa gider.', author: 'Henry David Thoreau' },
  { en: 'Simplify, simplify.', tr: 'Sadeleştir, sadeleştir.', author: 'Henry David Thoreau' },
  { en: 'To be awake is to be alive.', tr: 'Uyanık olmak, gerçekten yaşamaktır.', author: 'Henry David Thoreau' },
  { en: 'Things do not change; we change.', tr: 'Her şey aynı kalır; değişen biziz.', author: 'Henry David Thoreau' },
  { en: 'I like friends who have independent minds because they tend to make you see problems from all angles.', tr: 'Bağımsız düşünen dostları severim; sorunları farklı açılardan görmeme yardımcı olurlar.', author: 'Nelson Mandela' },
  { en: 'Nothing can bring you peace but yourself.', tr: 'Sana huzuru kendinden başka hiçbir şey getiremez.', author: 'Ralph Waldo Emerson' },
  { en: 'Do the thing, and you shall have the power.', tr: 'Harekete geç; gücü böyle kazanırsın.', author: 'Ralph Waldo Emerson' },
  { en: 'Insist on yourself; never imitate.', tr: 'Kendin olmakta ısrar et; asla taklit etme.', author: 'Ralph Waldo Emerson' },
  { en: 'The only way to have a friend is to be one.', tr: 'Bir dosta sahip olmanın tek yolu, dost olmaktır.', author: 'Ralph Waldo Emerson' },
  { en: 'Nothing great was ever achieved without enthusiasm.', tr: 'Coşku olmadan hiçbir büyük iş başarılmamıştır.', author: 'Ralph Waldo Emerson' },
  { en: 'If there is no struggle, there is no progress.', tr: 'Mücadele yoksa ilerleme de yoktur.', author: 'Frederick Douglass' },
  { en: 'It is in the character of growth that we should learn from both pleasant and unpleasant experiences.', tr: 'Gelişmek için hem güzel hem de zor deneyimlerden ders almalıyız.', author: 'Nelson Mandela' },
  { en: 'If it is not right, do not do it: if it is not true, do not say it.', tr: 'Doğru değilse yapma; gerçek değilse söyleme.', author: 'Marcus Aurelius' },
  { en: 'Confine thyself to the present.', tr: 'Yalnızca şimdiki ana odaklan.', author: 'Marcus Aurelius' },
  { en: 'The happiness of your life depends upon the quality of your thoughts.', tr: 'Hayatının mutluluğu, düşüncelerinin niteliğine bağlıdır.', author: 'Marcus Aurelius' },
  { en: 'Let no act be done without a purpose.', tr: 'Hiçbir işi amaçsız yapma.', author: 'Marcus Aurelius' },
  { en: 'Like what you do; then you will do your best.', tr: 'Yaptığın işi sev; o zaman elinden gelenin en iyisini yaparsın.', author: 'Katherine Johnson' },
  { en: 'It is impossible for a man to begin to learn that which he thinks that he knows.', tr: 'İnsan, bildiğini sandığı şeyi öğrenmeye başlayamaz.', author: 'Epictetus' },
  { en: 'If you would be a good reader, read; if a writer, write.', tr: 'İyi bir okur olmak istiyorsan oku; iyi bir yazar olmak istiyorsan yaz.', author: 'Epictetus' },
  { en: 'Every habit and faculty is maintained and increased by the corresponding actions.', tr: 'Her alışkanlık ve yetenek, ona uygun eylemlerle korunur ve geliştirilir.', author: 'Epictetus' },
  { en: 'Men are disturbed not by the things which happen, but by the opinions about the things.', tr: 'İnsanları rahatsız eden, yaşananlar değil, yaşananlar hakkındaki düşünceleridir.', author: 'Epictetus' },
  { en: 'Begin then from little things.', tr: 'Öyleyse küçük şeylerden başla.', author: 'Epictetus' },
  { en: 'One child, one teacher, one book, and one pen can change the world.', tr: 'Bir çocuk, bir öğretmen, bir kitap ve bir kalem dünyayı değiştirebilir.', author: 'Malala Yousafzai' },
  { en: 'While we are postponing, life speeds by.', tr: 'Biz ertelerken hayat hızla geçip gider.', author: 'Seneca' },
  { en: 'It is better to offer no excuse than a bad one.', tr: 'Kötü bir mazeret sunmaktansa hiç mazeret sunmamak daha iyidir.', author: 'George Washington' },
  { en: 'Begin at once to live, and count each separate day as a separate life.', tr: 'Hemen yaşamaya başla ve her bir günü başlı başına bir hayat say.', author: 'Seneca' },
  { en: 'Associate with those who will make a better man of you.', tr: 'Seni daha iyi bir insan yapacak kişilerle birlikte ol.', author: 'Seneca' },
  { en: 'You should keep learning as long as you are ignorant.', tr: 'Bilmediğin şeyler olduğu sürece öğrenmeye devam etmelisin.', author: 'Seneca' },
  { en: 'Little strokes fell great oaks.', tr: 'Küçük vuruşlar büyük meşeleri devirir.', author: 'Benjamin Franklin' },
  { en: 'Prove your words by your deeds.', tr: 'Sözlerini davranışlarınla kanıtla.', author: 'Seneca' },
  { en: 'Early to bed, and early to rise, makes a man healthy, wealthy, and wise.', tr: 'Erken yatıp erken kalkmak insanı sağlıklı, varlıklı ve bilge yapar.', author: 'Benjamin Franklin' },
  { en: 'Alone we can do so little; together we can do so much.', tr: 'Tek başımıza çok az şey yapabiliriz; birlikte çok şey yapabiliriz.', author: 'Helen Keller' },
  { en: 'Keep your face to the sunshine and you cannot see the shadows.', tr: 'Yüzünü güneşe dön; o zaman gölgeleri göremezsin.', author: 'Helen Keller' },
  { en: 'Never bend your head. Always hold it high.', tr: 'Başını asla eğme. Onu daima dik tut.', author: 'Helen Keller' },
  { en: 'Life is either a daring adventure or nothing.', tr: 'Hayat ya cesur bir maceradır ya da hiçbir şeydir.', author: 'Helen Keller' },
  { en: 'It is never too late to give up our prejudices.', tr: 'Önyargılarımızdan vazgeçmek için asla geç değildir.', author: 'Henry David Thoreau' },
  { en: 'We are never really happy until we try to brighten the lives of others.', tr: 'Başkalarının hayatlarını aydınlatmaya çalışmadıkça gerçekten mutlu olamayız.', author: 'Helen Keller' },
  { en: 'We tried in our simple way to lead our life in a manner that may make a difference to those of others.', tr: 'Biz de sade bir şekilde, başkalarının hayatında fark yaratacak biçimde yaşamaya çalıştık.', author: 'Nelson Mandela' },
  { en: 'The universe is wider than our views of it.', tr: 'Evren, ona ilişkin görüşlerimizden daha geniştir.', author: 'Henry David Thoreau' },
  { en: 'The time is always right to do right.', tr: 'Doğru olanı yapmak için doğru zaman her zamandır.', author: 'Martin Luther King Jr.' },
  { en: 'Your success and happiness lie in you.', tr: 'Başarı ve mutluluğunun kaynağı sensin.', author: 'Helen Keller' },
  { en: 'However difficult life may seem, there is always something you can do and succeed at.', tr: 'Hayat ne kadar zor görünürse görünsün, yapabileceğin ve başarabileceğin bir şey her zaman vardır.', author: 'Stephen Hawking' },
  { en: 'A happy life consists not in the absence, but in the mastery of hardships.', tr: 'Mutlu bir yaşam, zorlukların yokluğunda değil, onların üstesinden gelmekte yatar.', author: 'Helen Keller' },
  { en: 'The only way to do great work is to love what you do.', tr: 'Harika işler yapmanın tek yolu, yaptığın işi sevmektir.', author: 'Steve Jobs' },
  { en: 'You must do the thing you think you cannot do.', tr: 'Yapamayacağını düşündüğün şeyi yapmalısın.', author: 'Eleanor Roosevelt' },
  { en: 'Determine never to be idle.', tr: 'Asla boş durmamaya kararlı ol.', author: 'Thomas Jefferson' },
  { en: 'Forever is composed of nows.', tr: 'Sonsuzluk, içinde bulunduğumuz anlardan oluşur.', author: 'Emily Dickinson' },
  { en: 'Happiness lies not in the mere possession of money; it lies in the joy of achievement, in the thrill of creative effort.', tr: 'Mutluluk yalnızca paraya sahip olmakta değil; başarmanın sevincinde ve yaratıcı çabanın heyecanındadır.', author: 'Franklin D. Roosevelt' },
  { en: 'To love oneself is the beginning of a life-long romance.', tr: 'Kendini sevmek, ömür boyu sürecek bir aşkın başlangıcıdır.', author: 'Oscar Wilde' },
  { en: 'You cannot meet a challenge till you know what the challenge is.', tr: 'Bir zorluğun ne olduğunu bilmeden onunla başa çıkamazsın.', author: 'Eleanor Roosevelt' },
  { en: 'Sometimes people want to limit you because of their own limited imaginations.', tr: 'Bazen insanlar kendi hayal güçleri sınırlı olduğu için seni de sınırlamak ister.', author: 'Mae Jemison' },
  { en: 'I learned that courage was not the absence of fear, but the triumph over it.', tr: 'Cesaretin, korkunun yokluğu değil, korkuya üstün gelmek olduğunu öğrendim.', author: 'Nelson Mandela' },
  { en: 'What is true is that change can begin with just one person.', tr: 'Gerçek şu ki değişim tek bir kişiyle başlayabilir.', author: 'Malala Yousafzai' },
  { en: 'Cleverness is a gift, kindness is a choice.', tr: 'Zekâ bir armağandır; nazik olmak ise bir seçimdir.', author: 'Jeff Bezos' },
  { en: 'Work hard, be kind, and amazing things will happen.', tr: 'Çok çalış, nazik ol; harika şeyler olur.', author: 'Conan O’Brien' },
  { en: 'Every failed experiment is one step closer to success.', tr: 'Her başarısız deney, başarıya atılmış bir adım daha demektir.', author: 'Denzel Washington' },
  { en: 'When you’re doing the work you were meant to do, it feels right.', tr: 'Gerçekten sana uygun işi yaptığında, bunun doğru olduğunu hissedersin.', author: 'Oprah Winfrey' },
  { en: 'You should never view your challenges as a disadvantage.', tr: 'Karşılaştığın zorlukları asla bir dezavantaj olarak görmemelisin.', author: 'Michelle Obama' },
  { en: 'Integrity is choosing courage over comfort.', tr: 'İlkeli davranmak, rahatlık yerine cesareti seçmektir.', author: 'Brené Brown' },
  { en: 'Goals are good for setting a direction, but systems are best for making progress.', tr: 'Hedefler yön belirlemek için iyidir; ilerlemek içinse en iyi araç sistemlerdir.', author: 'James Clear' },
  { en: 'The noblest question in the world is What Good may I do in it?', tr: 'Dünyadaki en yüce soru şudur: Ne iyilik yapabilirim?', author: 'Benjamin Franklin' },
  { en: 'The superior man is modest in his speech, but exceeds in his actions.', tr: 'Olgun insan konuşurken ölçülüdür ama davranışlarıyla öne çıkar.', author: 'Confucius' },
  { en: 'Learning without thought is labor lost; thought without learning is perilous.', tr: 'Düşünmeden öğrenmek boşa emektir; öğrenmeden düşünmek ise tehlikelidir.', author: 'Confucius' },
  { en: 'To see what is right and not to do it is want of courage.', tr: 'Doğru olanı görüp yapmamak cesaret eksikliğidir.', author: 'Confucius' },
  { en: 'When we see men of worth, we should think of equaling them.', tr: 'Değerli insanları gördüğümüzde, onlar kadar iyi olmaya çalışmalıyız.', author: 'Confucius' },
  { en: 'What you do not want done to yourself, do not do to others.', tr: 'Kendine yapılmasını istemediğin şeyi başkasına yapma.', author: 'Confucius' },
  { en: 'The cautious seldom err.', tr: 'Dikkatli davrananlar nadiren hata yapar.', author: 'Confucius' },
  { en: 'The superior man wishes to be slow in his speech and earnest in his conduct.', tr: 'Olgun insan konuşurken temkinli, davranırken gayretli olmak ister.', author: 'Confucius' },
  { en: 'What the superior man seeks is in himself.', tr: 'Olgun insan, aradığını kendinde arar.', author: 'Confucius' },
  { en: 'The superior man is dignified, but does not wrangle.', tr: 'Olgun insan ağırbaşlıdır ama çekişmeye girmez.', author: 'Confucius' },
  { en: 'To understand is essential to progress.', tr: 'Anlamak, ilerleme için gereklidir.', author: 'Helen Keller' },
  { en: 'He who knows other men is discerning; he who knows himself is intelligent.', tr: 'Başkalarını tanıyan anlayışlıdır; kendini tanıyan akıllıdır.', author: 'Lao Tzu' },
  { en: 'He who overcomes others is strong; he who overcomes himself is mighty.', tr: 'Başkalarını yenen güçlüdür; kendini yenen asıl güçlüdür.', author: 'Lao Tzu' },
  { en: 'A journey of a thousand miles begins with a single step.', tr: 'Bin millik bir yolculuk tek bir adımla başlar.', author: 'Lao Tzu' },
  { en: 'The highest result of education is tolerance.', tr: 'Eğitimin en yüce sonucu hoşgörüdür.', author: 'Helen Keller' },
])

export function formatDailyMotivationBody(message, language) {
  return `“${message[language]}”\n— ${message.author}`
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
