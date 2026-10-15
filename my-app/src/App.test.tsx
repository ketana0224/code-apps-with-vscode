import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

vi.mock('/vite.svg', () => ({ default: '/vite.svg' }))

test('カウンターボタンをクリックすると値が1増える', async () => {
  const user = userEvent.setup()
  render(<App />)

  const button = screen.getByRole('button', { name: 'count is 0' })
  expect(button).toBeInTheDocument()

  await user.click(button)

  expect(
    screen.getByRole('button', { name: 'count is 1' }),
  ).toBeInTheDocument()
})
