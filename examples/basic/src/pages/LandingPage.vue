<script setup lang="ts">
import AppButton from '../components/AppButton.vue'
import FeatureCard from '../components/FeatureCard.vue'
import NoticeBadge from '../components/NoticeBadge.vue'
</script>

<template>
  <main class="page">

    <nav>
      <strong>Fieldnote</strong>
      <span>Product&nbsp;&nbsp;&nbsp; Stories&nbsp;&nbsp;&nbsp; About</span>
      <AppButton tone="dark">Start a project</AppButton>
    </nav>
    <section class="hero">
      <NoticeBadge :subtle="true">Beta</NoticeBadge>
      <p class="eyebrow">A calmer way to make software</p>
      <h1>Ideas deserve<br><em>room to grow.</em></h1>
      <p class="intro">Shape thoughtful digital products with a toolkit made for clarity, collaboration, and momentum.</p>
      <AppButton tone="lime">Explore the toolkit
      </AppButton>
      
    </section>

    <section class="designer-node-22">
      <section class="features">
      <FeatureCard number="01" title="Start with intent">Turn rough thinking into a shared direction before the details take over.
      </FeatureCard>
      <FeatureCard number="02" title="Build in context">Compose real components where content, behavior, and design stay connected.</FeatureCard>
      <FeatureCard number="03" title="Keep the source">Every decision remains readable Vue code that belongs to your project.</FeatureCard>
    </section>
      <section class="features">
      <FeatureCard number="01" title="Start with intent">Turn rough thinking into a shared direction before the details take over.
      </FeatureCard>
      <FeatureCard number="02" title="Build in context">Compose real components where content, behavior, and design stay connected.</FeatureCard>
      <FeatureCard number="03" title="Keep the source">Every decision remains readable Vue code that belongs to your project.</FeatureCard>
    </section>
      <section class="features">
      <FeatureCard number="01" title="Start with intent">Turn rough thinking into a shared direction before the details take over.
      </FeatureCard>
      <FeatureCard number="02" title="Build in context">Compose real components where content, behavior, and design stay connected.</FeatureCard>
      <FeatureCard number="03" title="Keep the source">Every decision remains readable Vue code that belongs to your project.</FeatureCard>
    </section>
      <section class="features">
      <FeatureCard v-for="(number, index) in 3" :number="index.toString()" title="Start with intent">Turn rough thinking into a shared direction before the details take over.
      </FeatureCard>
    </section>
    </section>

  </main>
</template>

<style scoped>
.page { min-height: 100vh; padding: 24px 5vw 60px; background: #f2f0e9; }
nav { display: flex; align-items: center; justify-content: space-between; }
nav strong { font-family: Newsreader, serif; font-size: 24px; }
nav > span { color: #656b62; font-size: 13px; }
.hero { max-width: 850px; margin: 13vh auto 11vh; text-align: center; }
.eyebrow { color: #64705f; font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; 
  text-align: center;}
h1 { margin: 20px 0; font: 500 clamp(64px, 9vw, 118px)/.82 Newsreader, serif; letter-spacing: -.05em; }
h1 em { color: #687b5d; font-weight: 500; }
.intro { max-width: 560px; margin: 32px auto; color: #656d62; font-size: 17px; line-height: 1.7; }
.features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; max-width: 1100px; margin: auto; }
@media (max-width: 700px) { nav > span { display: none; } .features { grid-template-columns: 1fr; } }

.designer-node-27 {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.designer-node-22 {
  gap: 10px;

  display: grid;}
</style>
