#if 0
""" "
#endif
/* The C code is a Python string; the Python code is skipped by C. */
#include <errno.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#define BASE UINT32_C(1000000000)

typedef struct {
    uint32_t *digits; /* Little-endian base-10^9 limbs. */
    size_t length;
    size_t capacity;
} BigInt;

static void reserve(BigInt *x, size_t needed)
{
    if (needed <= x->capacity)
        return;
    size_t capacity = x->capacity ? x->capacity : 4;
    while (capacity < needed) {
        if (capacity > SIZE_MAX / 2)
            goto exhausted;
        capacity *= 2;
    }
    if (capacity > SIZE_MAX / sizeof(*x->digits))
        goto exhausted;
    uint32_t *digits = realloc(x->digits, capacity * sizeof(*digits));
    if (!digits)
        goto exhausted;
    x->digits = digits;
    x->capacity = capacity;
    return;
exhausted:
    fputs("Not enough memory\n", stderr);
    exit(EXIT_FAILURE);
}

/* Replace a by a + b, without any fixed-width limit on the result. */
static void add(BigInt *a, const BigInt *b)
{
    size_t length = a->length > b->length ? a->length : b->length;
    reserve(a, length + 1);
    uint32_t carry = 0;
    for (size_t i = 0; i < length; ++i) {
        uint32_t sum = carry;
        if (i < a->length)
            sum += a->digits[i];
        if (i < b->length)
            sum += b->digits[i];
        carry = sum >= BASE;
        a->digits[i] = carry ? sum - BASE : sum;
    }
    a->length = length;
    if (carry)
        a->digits[a->length++] = carry;
}

int main(int argc, char **argv)
{
    if (argc != 2 || !argv[1][0]) {
        fputs("Usage: program N (nonnegative integer)\n", stderr);
        return EXIT_FAILURE;
    }
    for (const char *p = argv[1]; *p; ++p) {
        if (*p < '0' || *p > '9') {
            fputs("N must be a nonnegative integer\n", stderr);
            return EXIT_FAILURE;
        }
    }
    errno = 0;
    uintmax_t n = strtoumax(argv[1], NULL, 10);
    if (errno == ERANGE) {
        fputs("N is too large\n", stderr);
        return EXIT_FAILURE;
    }

    BigInt a = {NULL, 1, 0}, b = {NULL, 1, 0};
    reserve(&a, 1);
    reserve(&b, 1);
    a.digits[0] = 0;
    b.digits[0] = 1;
    for (uintmax_t i = 0; i < n; ++i) {
        add(&a, &b);
        BigInt temporary = a;
        a = b;
        b = temporary;
    }
    printf("%" PRIu32, a.digits[a.length - 1]);
    for (size_t i = a.length - 1; i > 0; --i)
        printf("%09" PRIu32, a.digits[i - 1]);
    putchar('\n');
    free(a.digits);
    free(b.digits);
    return EXIT_SUCCESS;
}
#if 0
""" # "
import sys


def main():
    if (len(sys.argv) != 2 or not sys.argv[1]
            or any(c < '0' or c > '9' for c in sys.argv[1])):
        sys.exit("Usage: program N (nonnegative integer)")
    # Python 3.12 normally limits conversion of very large decimal integers.
    sys.set_int_max_str_digits(0)
    n = int(sys.argv[1])
    a, b = 0, 1
    # Fast doubling: (F(k), F(k+1)) -> the pair for 2*k or 2*k+1.
    for bit in bin(n)[2:]:
        c = a * (2 * b - a)
        d = a * a + b * b
        a, b = (c, d) if bit == '0' else (d, c + d)
    print(a)


if __name__ == "__main__":
    main()
#endif
