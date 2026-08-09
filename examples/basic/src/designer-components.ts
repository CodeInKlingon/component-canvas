import AppButton from './components/AppButton.vue'
import FeatureCard from './components/FeatureCard.vue'
import NoticeBadge from './components/NoticeBadge.vue'

export default {
  AppButton: {
    component: AppButton,
    source: './components/AppButton.vue',
    label: 'Button',
    category: 'Actions',
    props: {
      tone: { control: 'select', options: ['lime', 'dark'] },
    },
  },
  FeatureCard: {
    component: FeatureCard,
    source: './components/FeatureCard.vue',
    label: 'Feature card',
    category: 'Content',
  },
  NoticeBadge: {
    component: NoticeBadge,
    source: './components/NoticeBadge.vue',
    label: 'Notice badge',
    category: 'Content',
    defaultContent: 'New',
  },
}
