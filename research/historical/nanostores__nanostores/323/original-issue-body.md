Hi

I noticed that when using 

```ts
afterEach(() => {
  cleanStores()
})
```

in my tests, all values wrapped in `computed()` are not reset

Example code:

```ts
export const $getThings = createFetcherStore(
  ['project', 'memberships', $projectId],
  {
    fetcher: () =>
      getThings().then((response) => response.data),
  },
);

export const $getProjectMembershipsWithSSHKeys = computed(
  [$getThings],
  (data) => ({
    ...data,
    data: data.data?.memberships.filter(someFilterFn)
  }),
);
```