// Revenue retention and Customers: which company's customer revenue the pages show. In a group each company keeps its
// own; "" is the group (every company combined). Sent as ?cust= on every customer request (see server cust-scope.ts).
export function useCustScope() {
  const scope = useState<string>('cust-scope', () => '')
  const q = () => (scope.value ? { cust: scope.value } : {})
  const qs = () => (scope.value ? '?cust=' + encodeURIComponent(scope.value) : '')
  return { scope, q, qs }
}
