import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import toast from 'react-hot-toast';
import { CreditCard, Loader2, Tag, Zap } from 'lucide-react';

interface Plan {
  key: string;
  sessions: number;
  baseAmount: number;
  discount: number;
  discountAmount: number;
  chargeAmount: number;
}

const planLabels: Record<string, { name: string; badge?: string; color: string }> = {
  STANDARD_MONTHLY: { name: 'Standard Monthly', color: 'border-grey-3' },
  IFITNESS_MONTHLY: { name: 'iFitness Monthly', badge: '20% OFF', color: 'border-brand-orange' },
  IFITNESS_QUARTERLY: { name: 'iFitness Quarterly', badge: '20% OFF • Best Value', color: 'border-brand-red' },
  IFITNESS_ANNUAL: { name: 'iFitness Annual', badge: '20% OFF • Best Deal', color: 'border-purple-400' },
  ADDITIONAL_SESSION: { name: 'Single Session Top-Up', color: 'border-grey-3' },
};

export default function EnrolleeTopUp() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ plans: Plan[] }>({
    queryKey: ['top-up-plans'],
    queryFn: () => apiClient.get('/member/top-up/plans').then((r) => r.data),
  });

  const initiateMutation = useMutation({
    mutationFn: (plan: string) =>
      apiClient.post<{ authorizationUrl: string; reference: string }>('/member/top-up/initiate', { plan }).then((r) => r.data),
    onSuccess: (data) => {
      if (data.authorizationUrl.includes('mock')) {
        toast.success('Mock payment — verifying...');
        apiClient.get(`/member/top-up/verify/${data.reference}`).then(() => {
          toast.success('Sessions added to your account!');
        });
      } else {
        window.location.href = data.authorizationUrl;
      }
    },
    onError: () => toast.error('Payment initiation failed. Try again.'),
  });

  const plans = data?.plans ?? [];

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-grey-5">Top Up Sessions</h1>
        <p className="text-sm text-grey-4 mt-1">
          Purchase additional gym sessions or upgrade to iFitness with your exclusive 20% Leadway discount.
        </p>
      </div>

      <div className="bg-brand-orange/10 border border-brand-orange/30 rounded-xl p-4 flex items-start gap-3">
        <Tag size={16} className="text-brand-orange mt-0.5 flex-shrink-0" />
        <div className="text-sm text-brand-orange">
          <strong>Leadway Member Exclusive:</strong> Enjoy 20% off all iFitness plans — monthly, quarterly, or annual. Discount applied at checkout.
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-grey-4 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading plans...
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const meta = planLabels[plan.key] ?? { name: plan.key, color: 'border-grey-3' };
            const isSelected = selectedPlan === plan.key;
            return (
              <button
                key={plan.key}
                onClick={() => setSelectedPlan(plan.key)}
                className={`w-full text-left p-5 rounded-xl border-2 transition-all
                  ${isSelected ? `${meta.color} bg-orange-50 shadow-sm` : 'border-grey-2 hover:border-grey-3'}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-grey-5">{meta.name}</span>
                      {meta.badge && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-brand-orange text-white rounded-full uppercase tracking-wide">
                          {meta.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-grey-4 mt-1">{plan.sessions} session{plan.sessions > 1 ? 's' : ''}</div>
                  </div>
                  <div className="text-right">
                    {plan.discount > 0 && (
                      <div className="text-xs text-grey-3 line-through">₦{plan.baseAmount.toLocaleString()}</div>
                    )}
                    <div className="text-lg font-bold text-brand-red">₦{plan.chargeAmount.toLocaleString()}</div>
                    {plan.discount > 0 && (
                      <div className="text-xs text-green-600 font-semibold">Save ₦{plan.discountAmount.toLocaleString()}</div>
                    )}
                  </div>
                </div>
                <div className="mt-3 text-xs text-grey-4">
                  ₦{Math.round(plan.chargeAmount / plan.sessions).toLocaleString()} per session
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedPlan && (
        <button
          onClick={() => initiateMutation.mutate(selectedPlan)}
          disabled={initiateMutation.isPending}
          className="w-full btn-primary flex items-center justify-center gap-2 py-3"
        >
          {initiateMutation.isPending ? (
            <><Loader2 size={16} className="animate-spin" /> Processing...</>
          ) : (
            <><CreditCard size={16} /> Pay with Paystack</>
          )}
        </button>
      )}

      <div className="card bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <Zap size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-700 space-y-1">
            <p><strong>Instant activation:</strong> Sessions are credited immediately after payment.</p>
            <p><strong>Monthly plan:</strong> Resets your session count for the month.</p>
            <p><strong>Quarterly/Annual:</strong> Total sessions available across the plan period.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
