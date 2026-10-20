#if 0
# Python code is skipped by the C compiler.
import sys


def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} N", file=sys.stderr)
        return 2
    try:
        n = int(sys.argv[1], 10)
    except ValueError:
        print("N must be a nonnegative integer", file=sys.stderr)
        return 2
    if n < 0:
        print("N must be a nonnegative integer", file=sys.stderr)
        return 2
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    # Chunked conversion avoids Python's configurable int-to-decimal digit limit.
    if a == 0:
        print(0)
    else:
        chunks = []
        while a:
            a, rem = divmod(a, 1_000_000_000)
            chunks.append(rem)
        print(str(chunks.pop()) + ''.join(f'{part:09d}' for part in reversed(chunks)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
#endif
#if 0
"""
#endif
#include <errno.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define BASE UINT32_C(1000000000)

typedef struct {
    uint32_t *digits;
    size_t length;
    size_t capacity;
} Big;

static int reserve(Big *x, size_t needed) {
    if (needed <= x->capacity) return 1;
    size_t cap = x->capacity ? x->capacity : 1;
    while (cap < needed) {
        if (cap > SIZE_MAX / 2) return 0;
        cap *= 2;
    }
    if (cap > SIZE_MAX / sizeof(*x->digits)) return 0;
    void *p = realloc(x->digits, cap * sizeof(*x->digits));
    if (!p) return 0;
    x->digits = p;
    x->capacity = cap;
    return 1;
}

static int add(Big *out, const Big *a, const Big *b) {
    size_t n = a->length > b->length ? a->length : b->length;
    if (!reserve(out, n + 1)) return 0;
    uint64_t carry = 0;
    for (size_t i = 0; i < n; ++i) {
        uint64_t sum = carry;
        if (i < a->length) sum += a->digits[i];
        if (i < b->length) sum += b->digits[i];
        out->digits[i] = (uint32_t)(sum % BASE);
        carry = sum / BASE;
    }
    out->length = n;
    if (carry) out->digits[out->length++] = (uint32_t)carry;
    return 1;
}

static int parse_n(const char *s, uint64_t *n) {
    if (!s || !*s || *s == '-') return 0;
    if (*s == '+') ++s;
    if (!*s) return 0;
    uint64_t value = 0;
    for (; *s; ++s) {
        if (*s < '0' || *s > '9') return 0;
        unsigned d = (unsigned)(*s - '0');
        if (value > (UINT64_MAX - d) / 10) return 0;
        value = value * 10 + d;
    }
    *n = value;
    return 1;
}

int main(int argc, char **argv) {
    uint64_t n;
    if (argc != 2 || !parse_n(argc == 2 ? argv[1] : NULL, &n)) {
        fprintf(stderr, "Usage: %s N (N must be a nonnegative integer)\n", argv[0]);
        return 2;
    }
    Big a = {0}, b = {0}, next = {0};
    if (!reserve(&a, 1) || !reserve(&b, 1)) goto memory_error;
    a.digits[0] = 0; a.length = 1;
    b.digits[0] = 1; b.length = 1;
    for (uint64_t i = 0; i < n; ++i) {
        if (!add(&next, &a, &b)) goto memory_error;
        Big tmp = a; a = b; b = next; next = tmp;
    }
    printf("%" PRIu32, a.digits[a.length - 1]);
    for (size_t i = a.length - 1; i > 0; --i)
        printf("%09" PRIu32, a.digits[i - 1]);
    putchar('\n');
    free(a.digits); free(b.digits); free(next.digits);
    return 0;
memory_error:
    fprintf(stderr, "Unable to allocate memory for Fibonacci result\n");
    free(a.digits); free(b.digits); free(next.digits);
    return 1;
}
#if 0
"""
#endif
