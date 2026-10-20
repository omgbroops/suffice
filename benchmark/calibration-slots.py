"""Conservative admission accounting; grading keeps a container, not a model slot."""
import math


def admission(active, max_models=2, max_containers=4):
    models = 0
    review = False
    for worker in active:
        if worker is None:
            models += 1
            continue
        usage = worker.get('usage', {})
        cost = usage.get('estimatedApiUsd')
        known = (isinstance(cost, (int, float)) and math.isfinite(cost) and cost >= 0
                 and usage.get('costUnknown') is False)
        finished = worker.get('status') in ['completed', 'verification_failed', 'verification_unavailable']
        if not finished or not known:
            review = True
            models += 1
    return {'models':models, 'containers':len(active), 'needsReview':review,
            'canAdmit':not review and models < max_models and len(active) < max_containers}
