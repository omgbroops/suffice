#if 0
import sys

if len(sys.argv) != 2 or not sys.argv[1] or any(
    c < "0" or c > "9" for c in sys.argv[1]
):
    sys.exit("Usage: main.py.c N (N must be a nonnegative integer)")

# Fibonacci numbers are not limited to the machine integer width.
sys.set_int_max_str_digits(0)
n = int(sys.argv[1])
a, b = 0, 1
for _ in range(n):
    a, b = b, a + b
print(a)
#endif /*
"""
*/
#include <errno.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

/* Unsigned arbitrary-precision integers, least-significant limb first. */
#define BASE UINT64_C(1000000000)
typedef struct {
    uint32_t *digit;
    size_t length, capacity;
} Big;

static void reserve(Big *x, size_t needed)
{
    if (needed <= x->capacity)
        return;
    if (needed > SIZE_MAX / sizeof(*x->digit)) {
        fputs("Number too large\n", stderr);
        exit(EXIT_FAILURE);
    }
    uint32_t *p = realloc(x->digit, needed * sizeof(*x->digit));
    if (!p) {
        fputs("Out of memory\n", stderr);
        exit(EXIT_FAILURE);
    }
    x->digit = p;
    x->capacity = needed;
}

static void add(Big *a, const Big *b)
{
    size_t length = a->length > b->length ? a->length : b->length;
    reserve(a, length + 1);
    uint64_t carry = 0;
    for (size_t i = 0; i < length; ++i) {
        uint64_t sum = carry;
        if (i < a->length)
            sum += a->digit[i];
        if (i < b->length)
            sum += b->digit[i];
        a->digit[i] = (uint32_t)(sum % BASE);
        carry = sum / BASE;
    }
    a->length = length;
    if (carry)
        a->digit[a->length++] = (uint32_t)carry;
}

int main(int argc, char **argv)
{
    if (argc != 2 || !argv[1][0])
        goto usage;
    for (const char *p = argv[1]; *p; ++p)
        if (*p < '0' || *p > '9')
            goto usage;
    errno = 0;
    char *end;
    unsigned long long n = strtoull(argv[1], &end, 10);
    if (errno == ERANGE || *end)
        goto usage;

    Big a = {NULL, 1, 0}, b = {NULL, 1, 0};
    reserve(&a, 1);
    reserve(&b, 1);
    a.digit[0] = 0;
    b.digit[0] = 1;
    for (unsigned long long i = 0; i < n; ++i) {
        add(&a, &b);
        Big temporary = a;
        a = b;
        b = temporary;
    }
    printf("%" PRIu32, a.digit[a.length - 1]);
    for (size_t i = a.length - 1; i > 0; --i)
        printf("%09" PRIu32, a.digit[i - 1]);
    putchar('\n');
    free(a.digit);
    free(b.digit);
    return EXIT_SUCCESS;

usage:
    fputs("Usage: cmain N (N must be a nonnegative integer)\n", stderr);
    return EXIT_FAILURE;
}
// """
