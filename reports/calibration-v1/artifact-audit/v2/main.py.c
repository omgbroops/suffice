#if 0
import sys

# Allow Fibonacci output beyond the default decimal digit limit.
sys.set_int_max_str_digits(0)

def fibonacci(n):
    # Fast doubling keeps Python practical for large indices.
    a, b = 0, 1
    for bit in bin(n)[2:]:
        c = a * (2 * b - a)
        d = a * a + b * b
        if bit == "0":
            a, b = c, d
        else:
            a, b = d, c + d
    return a

if len(sys.argv) != 2:
    raise SystemExit("usage: main.py.c N")
try:
    n = int(sys.argv[1])
except ValueError:
    raise SystemExit("N must be a nonnegative integer")
if n < 0:
    raise SystemExit("N must be a nonnegative integer")
print(fibonacci(n))
""" # "
#endif
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <errno.h>

/* Decimal big integers, least-significant digit first. */
static char *add(const char *x, const char *y) {
    size_t nx = strlen(x), ny = strlen(y), n = nx > ny ? nx : ny;
    char *out = (char *)malloc(n + 2);
    if (!out) { perror("malloc"); exit(2); }
    size_t i;
    int carry = 0;
    for (i = 0; i < n; ++i) {
        int sum = carry + (i < nx ? x[i] - '0' : 0) +
                            (i < ny ? y[i] - '0' : 0);
        out[i] = (char)('0' + sum % 10);
        carry = sum / 10;
    }
    if (carry) out[i++] = (char)('0' + carry);
    out[i] = '\0';
    return out;
}

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "usage: cmain N\n");
        return 2;
    }
    if (argv[1][0] == '-' || argv[1][0] == '\0') {
        fprintf(stderr, "N must be a nonnegative integer\n");
        return 2;
    }
    errno = 0;
    char *end = NULL;
    unsigned long long n = strtoull(argv[1], &end, 10);
    if (errno == ERANGE || end == argv[1] || *end != '\0') {
        fprintf(stderr, "N must be a nonnegative integer in range\n");
        return 2;
    }

    char *a = (char *)malloc(2), *b = (char *)malloc(2);
    if (!a || !b) { perror("malloc"); return 2; }
    strcpy(a, "0");
    strcpy(b, "1");
    for (unsigned long long i = 0; i < n; ++i) {
        char *next = add(a, b);
        free(a);
        a = b;
        b = next;
    }
    /* The stored digits are reversed; print in normal order. */
    for (size_t i = strlen(a); i > 0; --i) putchar(a[i - 1]);
    putchar('\n');
    free(a);
    free(b);
    return 0;
}
#if 0
""" # "
#endif
