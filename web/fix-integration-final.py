with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/integration.test.js', 'r') as f:
    lines = f.readlines()

# Find and replace the broken test
for i in range(len(lines)):
    if "it('should cleanup all intervals on unmount'" in lines[i]:
        # Find the end of this test (next 'it(' or closing of describe block)
        j = i + 1
        indent_count = 0
        while j < len(lines):
            if "it('" in lines[j] and lines[j].strip().startswith('it('):
                break
            if '});' in lines[j]:
                indent_count += 1
                if indent_count >= 1 and lines[j].strip() == '});':
                    break
            j += 1
        
        # Replace with correct test
        new_test = """    it('should cleanup all intervals on unmount', async () => {
      vi.useFakeTimers();
      
      router.mount();

      // Let intervals start
      await vi.advanceTimersByTimeAsync(100);
      const callsBeforeUnmount = api.getDashboardMetrics.mock.calls.length;
      
      // Unmount to stop intervals
      router.unmount();

      // Advance timers significantly after unmount
      await vi.advanceTimersByTimeAsync(10000);

      // After unmount, call count should not increase
      expect(api.getDashboardMetrics.mock.calls.length).toBe(callsBeforeUnmount);
      
      vi.useRealTimers();
    });

"""
        lines = lines[:i] + [new_test] + lines[j:]
        print(f"Fixed cleanup test starting at line {i+1}")
        break

with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/integration.test.js', 'w') as f:
    f.writelines(lines)
print("Fixed integration.test.js")
