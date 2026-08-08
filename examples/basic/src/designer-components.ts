import AppButton from './components/AppButton.vue'
import FeatureCard from './components/FeatureCard.vue'

export default {
  AppButton: {
    component: AppButton,
    label: 'Button',
    category: 'Actions',
    props: {
      tone: { control: 'select', options: ['lime', 'dark'] },
    },
  },
  FeatureCard: {
    component: FeatureCard,
    label: 'Feature card',
    category: 'Content',
  },
}
