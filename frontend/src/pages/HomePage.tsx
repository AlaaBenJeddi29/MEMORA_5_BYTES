import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

import dawnLake from '../assets/art/dawn-lake.webp'
import heroKeepsake from '../assets/art/hero-keepsake.webp'
import voiceWaves from '../assets/art/voice-waves.webp'
import { Icon, type IconName } from '../components/Icon'
import { useAuth } from '../features/auth/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const PILLARS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'pen',
    title: 'Write it down',
    body: 'A calm, uncluttered page for the sentence you almost forgot.',
  },
  {
    icon: 'mic',
    title: 'Say it out loud',
    body: 'Record a voice memo; the words are transcribed for you.',
  },
  {
    icon: 'sparkles',
    title: 'Read it back',
    body: 'Reflections that gather the mood, themes and shape of a day.',
  },
  {
    icon: 'image',
    title: 'Picture it',
    body: 'Keep photographs, or imagine a scene with your own ComfyUI.',
  },
  {
    icon: 'users',
    title: 'Remember who was there',
    body: 'Name the faces in your photos and revisit the moments you shared.',
  },
]

const STEPS: Array<{ number: string; icon: IconName; title: string; body: string }> = [
  {
    number: '01',
    icon: 'pen',
    title: 'Capture the day',
    body: 'Write a few lines, record a voice memo, or add a photograph. Any entry point is enough.',
  },
  {
    number: '02',
    icon: 'sparkles',
    title: 'Let MEMORA listen',
    body: 'Transcription, sentiment and reflections are generated server-side from what you choose to keep.',
  },
  {
    number: '03',
    icon: 'book',
    title: 'Return when you’re ready',
    body: 'Search by title or date, reread, correct the details, and let the record grow with you.',
  },
]

const PRIVACY_POINTS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'user',
    title: 'One owner per memory',
    body: 'Entries, memos, images, people and face tags are scoped to the account that created them. The API checks ownership on every request.',
  },
  {
    icon: 'lock',
    title: 'Session, not spectacle',
    body: 'Sign-in uses Django sessions with CSRF-protected writes. There is no public profile, follower count or share button.',
  },
  {
    icon: 'shield',
    title: 'AI keys stay on the server',
    body: 'Transcription and summary requests are made from Django to the configured provider. No API key ever reaches your browser.',
  },
  {
    icon: 'camera',
    title: 'Your own illustration studio',
    body: 'AI artwork is produced by the ComfyUI instance configured for this deployment — not a hosted image marketplace.',
  },
]

const WAVE_HEIGHTS = [18, 34, 52, 28, 66, 42, 78, 54, 30, 62, 86, 48, 70, 36, 58, 24, 44, 72, 40, 56]

export function HomePage() {
  useDocumentTitle('MEMORA — A private multimodal journal')
  const { status } = useAuth()
  const authenticated = status === 'authenticated'
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) {
      return
    }
    const target = document.getElementById(hash.slice(1))
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  const primaryHref = authenticated ? '/app' : '/register'
  const primaryLabel = authenticated ? 'Open your journal' : 'Begin your journal'

  return (
    <div className="landing">
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="landing-hero" aria-labelledby="home-heading">
        <div className="container landing-hero__grid">
          <div className="landing-hero__copy">
            <p className="eyebrow">A private multimodal journal</p>
            <h1 id="home-heading">
              Keep the days that
              <em> make a life.</em>
            </h1>
            <p className="landing-hero__lede">
              Write it. Say it. Photograph it. MEMORA holds your words, voice, reflections and
              images in one quiet place — built for one reader, you.
            </p>

            <div className="landing-hero__actions">
              <Link className="btn btn--lg" to={primaryHref}>
                {primaryLabel}
                <Icon name="arrowRight" size={17} />
              </Link>
              <a className="landing-hero__explore" href="#journal">
                Explore the journal
                <Icon name="chevronDown" size={16} />
              </a>
            </div>

            <ul className="landing-hero__trust">
              <li>
                <Icon name="lock" size={15} />
                Private by default
              </li>
              <li>
                <Icon name="leaf" size={15} />
                No feed. No audience.
              </li>
              <li>
                <Icon name="wave" size={15} />
                Words, voice, images
              </li>
            </ul>
          </div>

          <div className="landing-hero__visual">
            <span className="landing-hero__halo" aria-hidden="true" />
            <figure className="landing-hero__frame">
              <img
                src={heroKeepsake}
                alt="An open linen journal beside a cup of tea, a plum fountain pen and pressed lavender in soft morning light."
                width={928}
                height={1152}
              />
            </figure>

            <div className="landing-hero__note">
              <Icon name="quote" size={22} />
              <p>Some days deserve more than a scroll.</p>
              <span>The idea behind MEMORA</span>
            </div>

            <div className="landing-hero__chip">
              <Icon name="sparkles" size={15} />
              Four ways to remember
            </div>
          </div>
        </div>

        <div className="landing-ribbon" aria-label="What you can keep">
          <div className="container landing-ribbon__inner">
            {PILLARS.map((pillar) => (
              <span className="landing-ribbon__item" key={pillar.title}>
                <Icon name={pillar.icon} size={16} />
                {pillar.title}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Written journal                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section className="landing-section" id="journal" aria-labelledby="journal-heading">
        <div className="container landing-split">
          <div className="landing-copy">
            <p className="eyebrow">01 · Written journal</p>
            <h2 id="journal-heading">
              A page that waits
              <em> for you.</em>
            </h2>
            <p>
              No blank-screen pressure. Begin with a title and one honest sentence. MEMORA keeps
              every entry as you wrote it, with the date, the mood and a summary beside it.
            </p>

            <ul className="landing-list">
              <li>
                <Icon name="search" size={18} />
                Search your entries by title, or narrow them by date.
              </li>
              <li>
                <Icon name="edit" size={18} />
                Reopen, correct and revisit any page — the words stay editable.
              </li>
              <li>
                <Icon name="tag" size={18} />
                Keep sentiment notes and a short summary next to the entry.
              </li>
            </ul>

            <Link className="landing-text-link" to={authenticated ? '/app/journal' : '/register'}>
              {authenticated ? 'Open your journal' : 'Start your first entry'}
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>

          <div className="landing-journal-visual" aria-hidden="true">
            <div className="landing-sheet">
              <div className="landing-sheet__head">
                <span>Today</span>
                <span>Journal</span>
              </div>
              <h3>What I want to remember</h3>
              <p>
                This page is waiting for a sentence, a list, a small detail from the day — whatever
                brings it back.
              </p>
              <div className="landing-sheet__lines">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <p className="landing-sheet__foot">
                <Icon name="heart" size={14} /> A blank page, ready when you are.
              </p>
            </div>
            <div className="landing-float-tag landing-float-tag--date">
              <Icon name="calendar" size={16} />
              Revisit any day
            </div>
            <div className="landing-float-tag landing-float-tag--save">
              <Icon name="check" size={16} />
              Saved to your account
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Voice                                                            */}
      {/* ---------------------------------------------------------------- */}
      <section className="landing-section landing-section--tint" id="voice" aria-labelledby="voice-heading">
        <div className="container landing-split landing-split--reverse">
          <div className="landing-voice-visual">
            <img
              src={voiceWaves}
              alt="Abstract watercolour ribbons and arcs in lavender, plum and sage, suggesting sound turning into memory."
              width={900}
              height={900}
            />
            <div className="landing-wave" aria-hidden="true">
              {WAVE_HEIGHTS.map((height, index) => (
                <span key={index} style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="landing-voice-tag">
              <span className="landing-voice-tag__dot" aria-hidden="true" />
              Record in the browser
            </div>
          </div>

          <div className="landing-copy">
            <p className="eyebrow">02 · Voice memos</p>
            <h2 id="voice-heading">
              Speak. It becomes
              <em> a page.</em>
            </h2>
            <p>
              Some memories arrive as a voice, not a sentence. Record a memo in the browser or
              upload an existing file, and keep the audio beside its transcription.
            </p>

            <ul className="landing-list">
              <li>
                <Icon name="mic" size={18} />
                Record with the microphone, or upload MP3, WAV, WebM or MP4 audio.
              </li>
              <li>
                <Icon name="volume" size={18} />
                Read the transcript, detected language, sentiment and a short summary.
              </li>
              <li>
                <Icon name="repeat" size={18} />
                Correct any misheard word, then carry the transcript into your journal.
              </li>
            </ul>

            <p className="landing-note">
              <Icon name="shield" size={15} />
              Audio is transcribed and analysed on the server by the AI provider configured for
              this deployment. The browser never holds the provider key.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Reflections                                                      */}
      {/* ---------------------------------------------------------------- */}
      <section
        className="landing-section"
        id="reflections"
        aria-labelledby="reflections-heading"
      >
        <div className="container">
          <div className="landing-center-copy">
            <p className="eyebrow">03 · AI reflections</p>
            <h2 id="reflections-heading">
              A reflection, not
              <em> a replacement.</em>
            </h2>
            <p>
              Choose an entry and ask for a reflection. MEMORA returns a structured recap — the
              shape of the day, not a verdict on it. Edit it, delete it, or keep it as it is.
            </p>
          </div>

          <div className="landing-reflection-grid">
            <article className="landing-reflection-card">
              <div className="landing-reflection-card__top">
                <span className="landing-reflection-card__label">Reflection</span>
                <span className="landing-sample">Sample structure</span>
              </div>
              <h3>“A quiet day, noticed.”</h3>
              <p>
                Your own reflection appears here — a plain-language recap of an entry you choose,
                written into your account and kept beside the original.
              </p>
              <div className="landing-reflection-fields">
                <span>
                  <Icon name="heart" size={15} /> Mood
                </span>
                <span>
                  <Icon name="tag" size={15} /> Themes
                </span>
                <span>
                  <Icon name="image" size={15} /> Illustration prompt
                </span>
              </div>
              <p className="landing-reflection-card__foot">
                <Icon name="lock" size={14} /> Generated server-side · editable · yours to delete
              </p>
            </article>

            <ul className="landing-capabilities">
              <li>
                <span className="landing-capabilities__icon">
                  <Icon name="sparkles" size={19} />
                </span>
                <div>
                  <h3>Generated from your words</h3>
                  <p>
                    Only an entry you select is sent for reflection. Everything else stays where it
                    is.
                  </p>
                </div>
              </li>
              <li>
                <span className="landing-capabilities__icon">
                  <Icon name="edit" size={19} />
                </span>
                <div>
                  <h3>Still yours to edit</h3>
                  <p>
                    Care for mood, themes and the illustration prompt; change anything the
                    reflection got wrong.
                  </p>
                </div>
              </li>
              <li>
                <span className="landing-capabilities__icon">
                  <Icon name="image" size={19} />
                </span>
                <div>
                  <h3>One step to an illustration</h3>
                  <p>
                    When a reflection carries an illustration prompt, send it to the media library
                    and create a scene.
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Gallery                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section
        className="landing-section landing-section--ink"
        id="gallery"
        aria-labelledby="gallery-heading"
      >
        <div className="container">
          <div className="landing-gallery__head">
            <div>
              <p className="eyebrow">04 · Media library</p>
              <h2 id="gallery-heading">
                A visual memory,
                <em> kept together.</em>
              </h2>
            </div>
            <p>
              Photographs you keep and illustrations you imagine, side by side in one private
              collection — each one clearly labelled for what it is.
            </p>
          </div>

          <div className="landing-gallery">
            <figure className="landing-gallery__tile landing-gallery__tile--tall">
              <img
                src={heroKeepsake}
                alt="A warm still life of a journal, tea and lavender."
                width={928}
                height={1152}
              />
              <figcaption>
                <span>Original photograph</span>
                Keep a moment exactly as it looked.
              </figcaption>
            </figure>
            <figure className="landing-gallery__tile">
              <img
                src={dawnLake}
                alt="A watercolour lake at dawn with a small rowing boat."
                width={928}
                height={1152}
              />
              <figcaption>
                <span>AI illustration</span>
                Imagine a scene from a prompt.
              </figcaption>
            </figure>
            <figure className="landing-gallery__tile">
              <img
                src={voiceWaves}
                alt="Abstract watercolour ribbons in lavender, plum and sage."
                width={900}
                height={900}
              />
              <figcaption>
                <span>Your collection</span>
                Search, filter and revisit everything.
              </figcaption>
            </figure>
          </div>

          <div className="landing-gallery__foot">
            <p>
              <Icon name="shield" size={15} />
              Illustrations are generated by the ComfyUI instance configured for your deployment.
              Media is visible only to its owner.
            </p>
            <Link className="landing-text-link" to={authenticated ? '/app/media' : '/register'}>
              {authenticated ? 'Visit your gallery' : 'See what you can keep'}
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* People                                                           */}
      {/* ---------------------------------------------------------------- */}
      <section className="landing-section" id="people" aria-labelledby="people-heading">
        <div className="container landing-people">
          <div className="landing-copy">
            <p className="eyebrow">05 · People</p>
            <h2 id="people-heading">
              The people inside
              <em> your story.</em>
            </h2>
            <p>
              Add the people who appear in your photographs. Give a face a name, open an album of
              the moments you share, and keep those connections inside your own account.
            </p>
            <ul className="landing-list">
              <li>
                <Icon name="users" size={18} />
                Keep a personal list of the people who matter.
              </li>
              <li>
                <Icon name="camera" size={18} />
                Tag detected faces in your own photos.
              </li>
              <li>
                <Icon name="folder" size={18} />
                Revisit every photo a person appears in, gathered into one album.
              </li>
            </ul>
            <Link className="landing-text-link" to={authenticated ? '/app/people' : '/register'}>
              {authenticated ? 'Open people' : 'Start your people list'}
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>

          <div className="landing-people-visual" aria-hidden="true">
            <div className="landing-people__ring landing-people__ring--one">
              <Icon name="user" size={26} />
            </div>
            <div className="landing-people__ring landing-people__ring--two">
              <Icon name="heart" size={24} />
            </div>
            <div className="landing-people__ring landing-people__ring--three">
              <Icon name="users" size={28} />
            </div>
            <div className="landing-people__label">A face becomes a name</div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* How it works                                                     */}
      {/* ---------------------------------------------------------------- */}
      <section className="landing-section landing-section--tint" aria-labelledby="how-heading">
        <div className="container">
          <div className="landing-center-copy">
            <p className="eyebrow">How it works</p>
            <h2 id="how-heading">
              Small rituals,
              <em> kept.</em>
            </h2>
            <p>
              MEMORA is built around a simple loop: notice something, give it a form, come back
              later. Nothing more demanding than that.
            </p>
          </div>

          <ol className="landing-steps">
            {STEPS.map((step) => (
              <li className="landing-step" key={step.number}>
                <span className="landing-step__number">{step.number}</span>
                <span className="landing-step__icon">
                  <Icon name={step.icon} size={20} />
                </span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Privacy                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="landing-section landing-privacy" id="privacy" aria-labelledby="privacy-heading">
        <div className="container landing-privacy__grid">
          <div className="landing-privacy__copy">
            <p className="eyebrow">Privacy</p>
            <h2 id="privacy-heading">
              Privacy isn’t a setting.
              <em> It’s the shape of the product.</em>
            </h2>
            <p>
              MEMORA has one audience: you. That is a design constraint, not a marketing line. Here
              is exactly how the pieces fit together.
            </p>
            <Link className="btn btn--secondary landing-privacy__cta" to={primaryHref}>
              {authenticated ? 'Return to your journal' : 'Begin privately'}
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>

          <ul className="landing-privacy__points">
            {PRIVACY_POINTS.map((point) => (
              <li key={point.title}>
                <span className="landing-privacy__icon">
                  <Icon name={point.icon} size={19} />
                </span>
                <h3>{point.title}</h3>
                <p>{point.body}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="container landing-privacy__foot">
          <p>What you won’t find here</p>
          <ul>
            <li>Public profiles</li>
            <li>Followers</li>
            <li>Advertising</li>
            <li>Data resale</li>
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Closing                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="landing-close" aria-labelledby="close-heading">
        <img
          className="landing-close__image"
          src={dawnLake}
          alt=""
          width={928}
          height={1152}
        />
        <div className="landing-close__veil" aria-hidden="true" />
        <div className="container landing-close__inner">
          <p className="eyebrow">A place to begin</p>
          <h2 id="close-heading">
            The next ordinary day
            <em> is worth keeping.</em>
          </h2>
          <p>
            Open a private journal for the things you don’t want to lose — in your own words, your
            own voice, your own time.
          </p>
          <div className="landing-close__actions">
            <Link className="btn btn--lg" to={primaryHref}>
              {primaryLabel}
              <Icon name="arrowRight" size={17} />
            </Link>
            {!authenticated && (
              <Link className="btn btn--secondary btn--lg" to="/login">
                Sign in
              </Link>
            )}
          </div>
          <p className="landing-close__caption">Illustration · a quiet lake at first light</p>
        </div>
      </section>
    </div>
  )
}
