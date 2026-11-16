#include "xnu-12377-mach-coalition.h"
#include <stddef.h>
#include <stdio.h>
int main(void){printf("%zu %zu\n",offsetof(struct coalition_resource_usage,phys_footprint),sizeof(struct coalition_resource_usage));}
