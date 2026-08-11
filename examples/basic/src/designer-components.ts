import AppButton from './components/AppButton.vue'
import FeatureCard from './components/FeatureCard.vue'
import NoticeBadge from './components/NoticeBadge.vue'
import MetricHighlight from './components/MetricHighlight.vue'

export default {
  AppButton: {
    component: AppButton,
    source: './components/AppButton.vue',
    label: 'Button',
    category: 'Actions',
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
    props: {
      accent: { control: 'color' },
    },
  },
  MetricHighlight: {
    component: MetricHighlight,
    source: './components/MetricHighlight.vue',
    label: 'Metric highlight',
    category: 'Content',
  },
}
